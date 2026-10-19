import "server-only";
import type { Block } from "./extract";
import { db } from "./supabase";

// Books are long, so their text is split into pages of about this many words. A new
// chapter starts a new page once the current one is reasonably full.
const PAGE_WORDS = 1500;
const CHAPTER_BREAK_WORDS = 600;

const countWords = (blocks: Block[]) =>
  blocks.reduce((n, b) => (b.type === "img" ? n : n + b.text.split(/\s+/).filter(Boolean).length), 0);

const CHAPTER = /^(chapter|book|part|volume|vol\.|act|scene|letter|stave|canto|prologue|epilogue|preface|introduction)\b|^[ivxlcdm]+\.?$|^\d+\.?$/i;

// Plain text → paragraphs. Handles both hard-wrapped text (Project Gutenberg: lines of
// ~70 characters, paragraphs separated by blank lines) and text copied from a web page
// or document (one paragraph per line).
export function textToBlocks(raw: string): Block[] {
  let text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  // Project Gutenberg wraps the book in a license header and footer.
  const start = /^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG.*$/im.exec(text);
  if (start) text = text.slice(start.index + start[0].length);
  const end = /^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/im.exec(text);
  if (end) text = text.slice(0, end.index);
  // "[Illustration: ...]" notes can span several lines and paragraphs.
  text = text.replace(/\[(illustration|picture)[^\]]*\]/gi, "");

  const paragraphs: string[] = [];
  for (const chunk of text.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    // Long lines mean the text isn't hard-wrapped: each line is its own paragraph.
    if (lines.some((l) => l.length > 120)) paragraphs.push(...lines);
    else paragraphs.push(lines.join(" "));
  }

  const blocks: Block[] = [];
  for (const p of paragraphs) {
    const t = p
      .replace(/_([^_]+)_/g, "$1") // Gutenberg's _italics_
      .replace(/--/g, "—")
      .replace(/\s+/g, " ")
      .trim();
    if (!t || /^[*\s.]+$/.test(t)) continue;
    const heading = t.length < 70 && (CHAPTER.test(t) || !/[.!?"”’:;,)]$/.test(t)) && t.split(" ").length <= 10;
    blocks.push({ type: heading ? "h" : "p", text: t });
  }
  return blocks;
}

export function paginate(blocks: Block[]): Block[][] {
  const pages: Block[][] = [];
  let page: Block[] = [];
  let words = 0;
  for (const b of blocks) {
    const lastIsHeading = page.at(-1)?.type === "h";
    const chapterStart = b.type === "h" && CHAPTER.test(b.text);
    if (page.length && !lastIsHeading && (words >= PAGE_WORDS || (chapterStart && words >= CHAPTER_BREAK_WORDS))) {
      pages.push(page);
      page = [];
      words = 0;
    }
    page.push(b);
    words += countWords([b]);
  }
  if (page.length) pages.push(page);
  return pages;
}

// Saves a book and its pages. Returns the article id (the existing one when the same
// public book was imported before).
export async function saveBook(book: {
  url: string;
  title: string;
  author: string | null;
  summary: string | null;
  imageUrl: string | null;
  text: string;
}): Promise<string> {
  const { data: existing, error } = await db().from("articles").select("id").eq("url", book.url).maybeSingle();
  if (error) throw error;
  if (existing) return existing.id as string;

  const pages = paginate(textToBlocks(book.text));
  const wordCount = countWords(pages.flat());
  if (wordCount < 30) throw new Error("본문이 너무 짧아요");

  const { data, error: insertError } = await db()
    .from("articles")
    .insert({
      source: "book",
      url: book.url,
      title: book.title,
      byline: book.author,
      excerpt: book.summary,
      image_url: book.imageUrl,
      blocks: [],
      word_count: wordCount,
      page_count: pages.length,
      popular_on: new Date().toISOString().slice(0, 10),
      popular_rank: 0,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  const id = data.id as string;

  const rows = pages.map((blocks, i) => ({ article_id: id, page: i + 1, blocks, word_count: countWords(blocks) }));
  for (let i = 0; i < rows.length; i += 50) {
    const { error: pageError } = await db().from("book_pages").insert(rows.slice(i, i + 50));
    if (pageError) {
      await db().from("articles").delete().eq("id", id);
      throw pageError;
    }
  }
  return id;
}

// ---- Project Gutenberg ----
// Search and metadata come from gutenberg.org's OPDS (Atom) catalog, which answers in
// about a second (the Gutendex JSON mirror often takes 30s+).

export interface PublicBook {
  id: number;
  title: string;
  author: string | null;
  coverUrl: string;
}

const GUTENBERG = "https://www.gutenberg.org";
export const gutenbergUrl = (id: number) => `${GUTENBERG}/ebooks/${id}`;
const coverUrl = (id: number) => `${GUTENBERG}/cache/epub/${id}/pg${id}.cover.medium.jpg`;

const decodeXml = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

// "Austen, Jane" → "Jane Austen"
const authorName = (name: string) =>
  name
    .split(/ and |; /)
    .map((n) => n.split(", ").reverse().join(" "))
    .join(", ");

// English books matching the query, best match first. An empty query lists the most
// downloaded ones.
export async function searchPublicBooks(query: string): Promise<PublicBook[]> {
  const url = new URL(`${GUTENBERG}/ebooks/search.opds/`);
  url.searchParams.set("query", `${query} l.en`.trim()); // l.en = English only
  if (!query) url.searchParams.set("sort_order", "downloads");
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Gutenberg search ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap(([, entry]) => {
    const id = Number(/<id>[^<]*\/ebooks\/(\d+)\.opds<\/id>/.exec(entry)?.[1]);
    if (!id) return []; // "Subjects" / "Authors" sub-listings
    const author = decodeXml(/<content[^>]*>([\s\S]*?)<\/content>/.exec(entry)?.[1] ?? "");
    return [{ id, title: decodeXml(/<title>([\s\S]*?)<\/title>/.exec(entry)?.[1] ?? ""), author: author || null, coverUrl: coverUrl(id) }];
  });
}

// Title, author and summary from the book's catalog entry.
async function publicBookInfo(id: number) {
  const res = await fetch(`${GUTENBERG}/ebooks/${id}.opds`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Gutenberg ${id}.opds ${res.status}`);
  const entry = /<entry>([\s\S]*?)<\/entry>/.exec(await res.text())?.[1] ?? "";
  const summary = /<p>\s*Summary:([\s\S]*?)<\/p>/.exec(entry)?.[1];
  const authors = [...entry.matchAll(/<author>\s*<name>([^<]+)<\/name>/g)].map((m) => authorName(decodeXml(m[1])));
  return {
    title: decodeXml(/<title>([\s\S]*?)<\/title>/.exec(entry)?.[1] ?? ""),
    author: authors.join(", ") || null,
    summary: summary ? decodeXml(summary).replace(/\s*\(This is an automatically generated summary\.\)$/, "") : null,
  };
}

// The plain-text file's own header ("Title: …", "Author: …") is the fallback.
const headerField = (text: string, field: string) =>
  new RegExp(`^${field}: *(.+)$`, "m").exec(text.slice(0, 5000))?.[1]?.trim() || null;

export async function importPublicBook(gutenbergId: number): Promise<string> {
  const url = gutenbergUrl(gutenbergId);
  const { data: existing, error } = await db().from("articles").select("id").eq("url", url).maybeSingle();
  if (error) throw error;
  if (existing) return existing.id as string;

  const [info, textRes] = await Promise.all([
    publicBookInfo(gutenbergId).catch(() => null),
    fetch(`${GUTENBERG}/ebooks/${gutenbergId}.txt.utf-8`, { cache: "no-store", signal: AbortSignal.timeout(40_000) }),
  ]);
  if (!textRes.ok) throw new Error(`Gutenberg ${gutenbergId}.txt ${textRes.status}`);
  const text = await textRes.text();

  return saveBook({
    url,
    title: info?.title || headerField(text, "Title") || `Project Gutenberg #${gutenbergId}`,
    author: info?.author ?? headerField(text, "Author"),
    summary: info?.summary ?? null,
    imageUrl: coverUrl(gutenbergId),
    text,
  });
}
