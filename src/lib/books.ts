import "server-only";
import { parseHTML } from "linkedom";
import { htmlToBlocks } from "./bookHtml";
import { findCover } from "./covers";
import type { Block } from "./extract";
import { db } from "./supabase";

// Books are long, so their text is split into pages of about this many words. A new
// chapter starts a new page once the current one is reasonably full.
const PAGE_WORDS = 1500;
const CHAPTER_BREAK_WORDS = 600;

const countWords = (blocks: Block[]) =>
  blocks.reduce((n, b) => (b.type === "img" ? n : n + b.text.split(/\s+/).filter(Boolean).length), 0);

const CHAPTER = /^(chapt\w*|book|part|volume|vol\.|act|scene|letter|stave|canto|prologue|epilogue|preface|introduction)\b|^[ivxlcdm]+\.?$|^\d+\.?$/i;

// Joins wrapped lines; with `ocr`, a word hyphenated across lines ("sore-" / "ness")
// is put back together.
function joinLines(lines: string[], ocr: boolean): string {
  let out = "";
  for (const line of lines) {
    if (ocr && /[a-z]-$/.test(out) && /^[a-z]/.test(line)) out = out.slice(0, -1) + line;
    else out = out ? `${out} ${line}` : line;
  }
  return out;
}

// Scanned books (Internet Archive OCR) print a running head and page number on every
// page — "xvi  JANE   EYRE", "INTRODUCTION  xv", "JANE EYEE 145" (OCR mangles them, so
// they don't repeat exactly) — and a printer's signature mark ("D") as lines of their own.
const PAGE_NUMBER = /^(\d+|[ivxlc]{2,})\b|\b(\d+|[ivxlc]{2,})\.?$/i;
function isPageFurniture(line: string): boolean {
  if (line.length <= 3) return true;
  return line.length <= 50 && line.split(" ").length <= 6 && PAGE_NUMBER.test(line) && !/^(chapt|book|part|vol|act|canto|letter)/i.test(line);
}

// Plain text → paragraphs. Handles both hard-wrapped text (Project Gutenberg: lines of
// ~70 characters, paragraphs separated by blank lines) and text copied from a web page
// or document (one paragraph per line). `ocr` adds cleanup for scanned books.
export function textToBlocks(raw: string, { ocr = false } = {}): Block[] {
  let text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  // Project Gutenberg wraps the book in a license header and footer.
  const start = /^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG.*$/im.exec(text);
  if (start) text = text.slice(start.index + start[0].length);
  const end = /^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/im.exec(text);
  if (end) text = text.slice(0, end.index);
  // "[Illustration: ...]" notes can span several lines and paragraphs.
  text = text.replace(/\[(illustration|picture)[^\]]*\]/gi, "");

  let chunks = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean))
    .filter((lines) => lines.length);

  if (ocr) chunks = chunks.filter((lines) => !(lines.length === 1 && isPageFurniture(lines[0])));

  const paragraphs: string[] = [];
  for (const lines of chunks) {
    // Long lines mean the text isn't hard-wrapped: each line is its own paragraph.
    if (lines.some((l) => l.length > 120)) paragraphs.push(...lines);
    else {
      const p = joinLines(lines, ocr);
      // OCR splits paragraphs at page breaks (and sometimes mid-page): a paragraph that
      // stops mid-sentence, or one that continues in lower case, belongs to the previous one.
      const prev = paragraphs.at(-1);
      if (ocr && prev && (/[a-z,;—-]$/.test(prev) || (prev.length > 70 && !/[.!?"”’':)]$/.test(prev) && /^[a-z]/.test(p)))) {
        paragraphs[paragraphs.length - 1] = joinLines([prev, p], true);
      } else paragraphs.push(p);
    }
  }

  const blocks: Block[] = [];
  for (const p of paragraphs) {
    let t = p
      .replace(/_([^_]+)_/g, "$1") // Gutenberg's _italics_
      .replace(/--/g, "—")
      .replace(/\s+/g, " ")
      .trim();
    // OCR keeps the typesetter's spaces before punctuation: "Lewes ;" → "Lewes;"
    if (ocr) t = t.replace(/ ([;:,.!?])/g, "$1").replace(/(^|\s)' (?=\w)/g, "$1'");
    if (!t || /^[*\s.]+$/.test(t)) continue;
    const heading = t.length < 70 && (CHAPTER.test(t) || !/[.!?"”’'‘:;,)]$/.test(t)) && t.split(" ").length <= 10;
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
  text?: string;
  ocr?: boolean;
  blocks?: Block[]; // already split into paragraphs (HTML books)
}): Promise<string> {
  const { data: existing, error } = await db().from("articles").select("id").eq("url", book.url).maybeSingle();
  if (error) throw error;
  if (existing) return existing.id as string;

  const pages = paginate(book.blocks ?? textToBlocks(book.text ?? "", { ocr: book.ocr }));
  const wordCount = countWords(pages.flat());
  if (wordCount < 30) throw new Error("본문이 너무 짧아요");

  // Books typed in or loaded from a file get a cover from the web; "" = none found.
  const imageUrl = book.imageUrl ?? (await findCover(book.title, book.author)) ?? "";

  const { data, error: insertError } = await db()
    .from("articles")
    .insert({
      source: "book",
      url: book.url,
      title: book.title,
      byline: book.author,
      excerpt: book.summary,
      image_url: imageUrl,
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

// Books saved before covers were looked up have image_url null: look them up once.
export async function fillMissingCovers<T extends { id: string; title: string; byline: string | null; image_url: string | null }>(
  books: T[],
): Promise<T[]> {
  const missing = books.filter((b) => b.image_url === null);
  if (!missing.length) return books;
  const found = new Map(
    await Promise.all(
      missing.map(async (b) => {
        const url = (await findCover(b.title, b.byline)) ?? "";
        await db().from("articles").update({ image_url: url }).eq("id", b.id).is("image_url", null);
        return [b.id, url] as const;
      }),
    ),
  );
  return books.map((b) => (found.has(b.id) ? { ...b, image_url: found.get(b.id)! } : b));
}

// ---- Project Gutenberg ----
// Search and metadata come from gutenberg.org's OPDS (Atom) catalog, which answers in
// about a second (the Gutendex JSON mirror often takes 30s+).

export type PublicSource = "gutenberg" | "standard" | "archive";

export interface PublicBook {
  source: PublicSource;
  id: string; // Gutenberg ebook number, Standard Ebooks path or Internet Archive identifier
  url: string; // stored as the book's url, so an imported book is recognized
  title: string;
  author: string | null;
  coverUrl: string;
  year?: string | null;
}

const GUTENBERG = "https://www.gutenberg.org";
export const gutenbergUrl = (id: number) => `${GUTENBERG}/ebooks/${id}`;
const coverUrl = (id: number | string) => `${GUTENBERG}/cache/epub/${id}/pg${id}.cover.medium.jpg`;

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
    return [
      {
        source: "gutenberg" as const,
        id: String(id),
        url: gutenbergUrl(id),
        title: decodeXml(/<title>([\s\S]*?)<\/title>/.exec(entry)?.[1] ?? ""),
        author: author || null,
        coverUrl: coverUrl(id),
      },
    ];
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

// ---- Internet Archive ----
// Scanned books with an OCR text file (`*_djvu.txt`). Items that are only lent out
// (in copyright) are excluded; their text file can't be downloaded.

const ARCHIVE = "https://archive.org";
export const archiveUrl = (identifier: string) => `${ARCHIVE}/details/${identifier}`;
export const isArchiveId = (id: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id);
const MAX_TEXT_BYTES = 8 * 1024 * 1024;

// "Brontë, Charlotte, 1816-1855" → "Charlotte Brontë"
const archiveCreator = (c: unknown) =>
  (Array.isArray(c) ? c : c ? [c] : [])
    .map((n) => String(n).replace(/,?\s*(b\.\s*|ca\.\s*)?\d{4}.*$/, "").replace(/^([^,]+), ([^,]+)$/, "$2 $1").trim())
    .filter(Boolean)
    .join(", ") || null;

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined;

export async function searchArchiveBooks(query: string): Promise<PublicBook[]> {
  const terms = query.replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim();
  if (!terms) return [];
  const q = [
    `(title:(${terms}) OR creator:(${terms}))`,
    "mediatype:texts",
    "format:DjVuTXT",
    "language:(eng OR English)",
    "-access-restricted-item:true",
    "-collection:(inlibrary OR printdisabled)",
  ].join(" AND ");
  const url = new URL(`${ARCHIVE}/advancedsearch.php`);
  url.searchParams.set("q", q);
  for (const f of ["identifier", "title", "creator", "year"]) url.searchParams.append("fl[]", f);
  url.searchParams.append("sort[]", "downloads desc");
  url.searchParams.set("rows", "30");
  url.searchParams.set("output", "json");
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`archive.org search ${res.status}`);
  const json = (await res.json()) as { response: { docs: Record<string, unknown>[] } };
  return json.response.docs.map((d) => {
    const id = String(d.identifier);
    return {
      source: "archive" as const,
      id,
      url: archiveUrl(id),
      title: String(first(d.title) ?? id).replace(/\s+/g, " ").trim(),
      author: archiveCreator(d.creator),
      coverUrl: `${ARCHIVE}/services/img/${id}`,
      year: d.year ? String(first(d.year)) : null,
    };
  });
}

export async function importArchiveBook(identifier: string): Promise<string> {
  if (!isArchiveId(identifier)) throw new Error("잘못된 항목이에요");
  const url = archiveUrl(identifier);
  const { data: existing, error } = await db().from("articles").select("id").eq("url", url).maybeSingle();
  if (error) throw error;
  if (existing) return existing.id as string;

  const res = await fetch(`${ARCHIVE}/metadata/${identifier}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`archive.org metadata ${res.status}`);
  const item = (await res.json()) as {
    metadata?: Record<string, unknown>;
    files?: { name: string; format?: string; size?: string }[];
  };
  const m = item.metadata ?? {};
  if (m["access-restricted-item"] === "true") throw new Error("대출 전용 책이라 가져올 수 없어요");
  // A multi-volume item has one OCR file per volume; take the largest.
  const file = (item.files ?? [])
    .filter((f) => f.format === "DjVuTXT" || f.name.endsWith("_djvu.txt"))
    .sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0))[0];
  if (!file) throw new Error("이 항목에는 텍스트 파일이 없어요");
  if (Number(file.size ?? 0) > MAX_TEXT_BYTES) throw new Error("책이 너무 커요");

  const textRes = await fetch(`${ARCHIVE}/download/${identifier}/${encodeURIComponent(file.name)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(40_000),
  });
  if (!textRes.ok) throw new Error(`archive.org text ${textRes.status}`);
  const description = first(m.description);
  return saveBook({
    url,
    title: String(first(m.title) ?? identifier).replace(/\s+/g, " ").trim(),
    author: archiveCreator(m.creator),
    summary: description ? decodeXml(description).slice(0, 600) || null : null,
    imageUrl: `${ARCHIVE}/services/img/${identifier}`,
    text: await textRes.text(),
    ocr: true,
  });
}

// ---- Standard Ebooks ----
// Public-domain books re-edited and proofread from Gutenberg and scans. Each book has a
// single-page HTML edition, read straight into blocks (chapters stay headings).

const STANDARD = "https://standardebooks.org";
export const standardUrl = (path: string) => `${STANDARD}/ebooks/${path}`;
// "jane-austen/mansfield-park", or with translator/illustrator segments.
export const isStandardId = (id: string) => /^[a-z0-9-]+(\/[a-z0-9-]+){1,4}$/.test(id);

export async function searchStandardEbooks(query: string): Promise<PublicBook[]> {
  const url = new URL(`${STANDARD}/ebooks`);
  if (query) url.searchParams.set("query", query);
  else url.searchParams.set("sort", "popularity");
  url.searchParams.set("per-page", "24");
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Standard Ebooks search ${res.status}`);
  const html = await res.text();
  return [...html.matchAll(/<li typeof="schema:Book" about="\/ebooks\/([^"]+)">([\s\S]*?)<\/li>/g)].flatMap(([, id, item]) => {
    if (!isStandardId(id)) return [];
    const names = [...item.matchAll(/<span property="schema:name">([^<]*)<\/span>/g)].map((m) => decodeXml(m[1]));
    const cover = /<img src="([^"]+)"/.exec(item)?.[1];
    return [
      {
        source: "standard" as const,
        id,
        url: standardUrl(id),
        title: names[0] ?? id,
        author: names.slice(1).join(", ") || null,
        coverUrl: cover ? new URL(cover, STANDARD).href : `${standardUrl(id)}/downloads/cover-thumbnail.jpg`,
      },
    ];
  });
}

const metaContent = (html: string, attr: string, name: string) =>
  new RegExp(`<meta content="([^"]*)" ${attr}="${name}"|<meta ${attr}="${name}" content="([^"]*)"`).exec(html)?.slice(1).find(Boolean);

export async function importStandardEbook(path: string): Promise<string> {
  if (!isStandardId(path)) throw new Error("잘못된 항목이에요");
  const url = standardUrl(path);
  const { data: existing, error } = await db().from("articles").select("id").eq("url", url).maybeSingle();
  if (error) throw error;
  if (existing) return existing.id as string;

  // The book's page only adds the summary and author; the text is what matters.
  const [page, textRes] = await Promise.all([
    fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) })
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => ""),
    fetch(`${url}/text/single-page`, { cache: "no-store", signal: AbortSignal.timeout(40_000) }),
  ]);
  if (!textRes.ok) throw new Error(`Standard Ebooks ${textRes.status}`);
  const { document } = parseHTML(await textRes.text());

  // Only the book itself: not the title page, imprint, table of contents, colophon or license.
  const sections = [...document.querySelectorAll("section, article")].filter(
    (s) => /\bbodymatter\b/.test(s.getAttribute("epub:type") ?? "") && !s.parentElement?.closest("section, article"),
  );
  const blocks = sections.length ? sections.flatMap((s) => htmlToBlocks(s)) : htmlToBlocks(document.body);

  // og:title is "Mansfield Park, by Jane Austen - Free ebook download".
  const ogTitle = decodeXml(metaContent(page, "property", "og:title") ?? "").replace(/ - Free ebook download$/, "");
  const [, title, author] = /^(.*), by (.*)$/.exec(ogTitle) ?? [null, ogTitle, null];
  const summary = metaContent(page, "property", "schema:abstract");
  return saveBook({
    url,
    title: title || decodeXml(document.querySelector("title")?.textContent ?? "") || path,
    author: author || null,
    summary: summary ? decodeXml(summary) : null,
    imageUrl: `${url}/downloads/cover-thumbnail.jpg`,
    blocks,
  });
}
