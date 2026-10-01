import "server-only";
import { db } from "./supabase";

const SOURCE_URL = "https://raw.githubusercontent.com/worldbookmap/studylang/main/data/study-colly.json";

interface StudyEntry {
  id: string;
  type: string;
  english: string;
  korean: string;
  createdAt: string;
}

// Replaces study_words with the current `type: "word"` entries of study-colly.json.
// Entries removed from the file are removed here too.
export async function importStudyWords(): Promise<{ imported: number }> {
  // The query string sidesteps raw.githubusercontent.com's ~5 minute CDN cache.
  const res = await fetch(`${SOURCE_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`study-colly.json: HTTP ${res.status}`);
  const { entries } = (await res.json()) as { entries: StudyEntry[] };

  const now = new Date().toISOString();
  const rows = entries
    .filter((e) => e.type === "word" && e.english?.trim() && e.korean?.trim())
    .map((e) => ({
      id: e.id,
      word: e.english.trim(),
      meaning: e.korean.trim(),
      created_at: e.createdAt ?? now,
      imported_at: now,
    }));

  if (rows.length) {
    const { error } = await db().from("study_words").upsert(rows);
    if (error) throw error;
  }
  const { error } = await db().from("study_words").delete().lt("imported_at", now);
  if (error) throw error;
  return { imported: rows.length };
}
