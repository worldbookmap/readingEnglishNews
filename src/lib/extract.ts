import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

// Articles are stored as plain-text blocks rather than raw HTML: nothing from the
// source site is ever injected into our pages, and the reader can tokenize the text
// into clickable words/sentences.
export type Block =
  | { type: "p" | "h" | "quote" | "li"; text: string }
  | { type: "img"; src: string; caption?: string };

export interface ExtractedArticle {
  title: string;
  byline: string | null;
  excerpt: string | null;
  siteName: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  blocks: Block[];
  wordCount: number;
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function meta(doc: Document, ...names: string[]): string | null {
  for (const n of names) {
    const el = doc.querySelector(`meta[property="${n}"], meta[name="${n}"]`);
    const v = el?.getAttribute("content");
    if (v) return v;
  }
  return null;
}

// Text that shows up inside article bodies but isn't part of the story.
const JUNK = /^(advertisement|article continues after advertisement|comments|sign up.*|subscribe.*|read more.*|related:.*|recommended.*|newsletter.*|view this (photo|video) on .*)$/i;
// Photo credits like "Kevin Dietsch / Getty Images" or "Margo Martin/x.com".
const CREDIT = /(\/|\bvia\b|getty|images|\.com\b|instagram|tiktok|twitter|reddit|youtube|netflix|courtesy)/i;
const isCredit = (t: string) => t.length < 70 && !/[.!?"”]$/.test(t) && CREDIT.test(t);

function toBlocks(contentHtml: string): Block[] {
  const { document } = parseHTML(`<!doctype html><html><body>${contentHtml}</body></html>`);
  const blocks: Block[] = [];
  const els = document.querySelectorAll("p, h1, h2, h3, h4, h5, blockquote, li, img");
  for (const el of els) {
    const tag = el.tagName.toLowerCase();
    if (tag === "img") {
      const src = el.getAttribute("src") || el.getAttribute("data-src");
      if (src && /^https?:\/\//.test(src)) {
        const caption = clean(el.closest("figure")?.querySelector("figcaption")?.textContent);
        blocks.push({ type: "img", src, caption: caption || undefined });
      }
      continue;
    }
    // Avoid duplicating text: a <p> inside a <blockquote>/<li> is handled by the parent.
    if (tag === "p" && el.parentElement?.closest("blockquote, li")) continue;
    if (el.closest("figcaption")) continue;
    const text = clean(el.textContent);
    if (!text || JUNK.test(text) || isCredit(text)) continue;
    // Some sites (BuzzFeed) put body copy in <h3>; only short lines are real headings.
    const type =
      tag.startsWith("h") ? (text.length <= 100 ? "h" : "p") : tag === "blockquote" ? "quote" : tag === "li" ? "li" : "p";
    blocks.push({ type, text });
  }
  return blocks;
}

// BuzzFeed list posts are a sequence of "subbuzz" cards (title, image, description).
// Readability tends to drop some of them (often item #1), so read them directly.
function buzzfeedBlocks(doc: Document): Block[] {
  const blocks: Block[] = [];
  for (const sb of doc.querySelectorAll(".subbuzzes-wrapper .subbuzz")) {
    const title = clean(sb.querySelector(".subbuzz__title")?.textContent);
    if (title && !JUNK.test(title)) blocks.push({ type: title.length <= 100 ? "h" : "p", text: title });
    const img = sb.querySelector("img.subbuzz__media-image, .subbuzz__media img");
    const src = img?.getAttribute("data-src") || img?.getAttribute("src");
    if (src && /^https?:\/\//.test(src)) blocks.push({ type: "img", src });
    for (const el of sb.querySelectorAll(".subbuzz__description p, .subbuzz__description li")) {
      const text = clean(el.textContent);
      if (text && !JUNK.test(text) && !isCredit(text)) blocks.push({ type: el.tagName === "LI" ? "li" : "p", text });
    }
  }
  return blocks;
}

export function extractArticle(html: string, url: string): ExtractedArticle {
  const { document } = parseHTML(html);
  // Readability resolves relative links against the document URL.
  try {
    const base = document.createElement("base");
    base.setAttribute("href", url);
    document.head?.prepend(base);
  } catch {}

  const siteBlocks = new URL(url).hostname.endsWith("buzzfeed.com") ? buzzfeedBlocks(document as unknown as Document) : [];
  const ogImage = meta(document, "og:image", "twitter:image");
  const publishedAt = meta(document, "article:published_time", "datePublished", "pubdate");
  const parsed = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
  if (!parsed?.content) throw new Error(`Could not extract article from ${url}`);

  const siteTextBlocks = siteBlocks.filter((b) => b.type !== "img").length;
  const blocks = siteTextBlocks >= 3 ? siteBlocks : toBlocks(parsed.content);
  const wordCount = blocks.reduce((n, b) => (b.type === "img" ? n : n + b.text.split(/\s+/).length), 0);

  return {
    title: clean(parsed.title) || clean(meta(document, "og:title")) || url,
    // Lithub appends the date: "Ryan Chapman September 30, 2026".
    byline: clean(parsed.byline).replace(/\s+(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}$/, "") || null,
    excerpt: clean(parsed.excerpt) || null,
    siteName: clean(parsed.siteName) || null,
    imageUrl: ogImage,
    publishedAt: publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? new Date(publishedAt).toISOString() : null,
    blocks,
    wordCount,
  };
}
