import "server-only";
import { createHash } from "node:crypto";
import type { Block } from "./extract";
import { db } from "./supabase";

// Korean translations from the 번역 노트 Chrome extension (see 0017_translations.sql).
// Paragraphs are matched by the md5 of their English text, the same key the
// book_translation_progress SQL function computes from book_pages.

// The extension reads a list item with the reader's "•" in front of it.
export const normalizeSource = (s: string) => s.replace(/\s+/g, " ").trim().replace(/^•\s*/, "");
export const sourceHash = (s: string) => createHash("md5").update(normalizeSource(s), "utf8").digest("hex");

// Each block's translation (by index), for the blocks that have one.
export async function blockTranslations(blocks: Block[]): Promise<Record<number, string>> {
  const hashes = blocks.map((b) => (b.type === "img" ? null : sourceHash(b.text)));
  const wanted = [...new Set(hashes.filter((h): h is string => !!h))];
  if (!wanted.length) return {};
  const found = new Map<string, string>();
  for (let i = 0; i < wanted.length; i += 150) {
    const { data, error } = await db()
      .from("paragraph_translations")
      .select("source_hash, translation")
      .in("source_hash", wanted.slice(i, i + 150));
    // Translations are an extra: a missing table (0017 not run yet) mustn't break the page.
    if (error) return console.error("paragraph_translations", error.message), {};
    for (const r of data ?? []) found.set(r.source_hash as string, r.translation as string);
  }
  const out: Record<number, string> = {};
  hashes.forEach((h, i) => {
    const t = h && found.get(h);
    if (t) out[i] = t;
  });
  return out;
}

export interface TranslationProgress {
  done: number;
  total: number;
}

export async function translationProgress(ids: string[]): Promise<Map<string, TranslationProgress>> {
  if (!ids.length) return new Map();
  const { data, error } = await db().rpc("book_translation_progress", { ids });
  if (error) return console.error("book_translation_progress", error.message), new Map();
  return new Map(((data ?? []) as { article_id: string; done: number; total: number }[]).map((r) => [r.article_id, r]));
}

// One extension document: its translated paragraphs replace what it sent before.
// `keys` are all the extension keys it still has a translation for, including paragraphs
// whose English text it no longer knows (those rows are kept, not deleted).
export async function saveDocTranslations(doc: {
  url: string;
  pairs: { key: string; source: string; translation: string }[];
  keys: string[];
}) {
  const now = new Date().toISOString();
  const rows = new Map<string, { source_hash: string; source: string; translation: string; doc_url: string; ext_hash: string; updated_at: string }>();
  for (const p of doc.pairs) {
    const source = normalizeSource(p.source);
    const translation = p.translation.trim();
    if (!source || !translation) continue;
    rows.set(sourceHash(source), { source_hash: sourceHash(source), source, translation, doc_url: doc.url, ext_hash: p.key, updated_at: now });
  }
  const list = [...rows.values()];
  for (let i = 0; i < list.length; i += 500) {
    const { error } = await db().from("paragraph_translations").upsert(list.slice(i, i + 500));
    if (error) throw error;
  }
  // Translations cleared in the extension.
  const { data: existing, error } = await db().from("paragraph_translations").select("source_hash, ext_hash").eq("doc_url", doc.url);
  if (error) throw error;
  const keep = new Set(doc.keys);
  const gone = (existing ?? []).filter((r) => !keep.has(r.ext_hash as string)).map((r) => r.source_hash as string);
  for (let i = 0; i < gone.length; i += 150) {
    const { error: deleteError } = await db().from("paragraph_translations").delete().in("source_hash", gone.slice(i, i + 150));
    if (deleteError) throw deleteError;
  }
  return { saved: list.length, removed: gone.length };
}
