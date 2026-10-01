import "server-only";
import { STUDY_SOURCES, type StudySource } from "./studySources";
import { db } from "./supabase";

const fileUrl = (source: StudySource) =>
  `https://raw.githubusercontent.com/worldbookmap/studylang/main/data/${STUDY_SOURCES[source]}.json`;

// Entry types brought into the 암기장; contractions and dialogues are left out.
const IMPORTED_TYPES = new Set(["word", "pattern"]);

interface StudyEntry {
  id: string;
  type: string;
  english: string;
  korean: string;
  createdAt: string;
}

async function fetchWords(source: StudySource, now: string) {
  // The query string sidesteps raw.githubusercontent.com's ~5 minute CDN cache.
  const res = await fetch(`${fileUrl(source)}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${STUDY_SOURCES[source]}.json: HTTP ${res.status}`);
  const { entries } = (await res.json()) as { entries: StudyEntry[] };
  return entries
    .filter((e) => IMPORTED_TYPES.has(e.type) && e.english?.trim() && e.korean?.trim())
    .map((e) => ({
      source,
      id: e.id,
      word: e.english.trim(),
      meaning: e.korean.trim(),
      created_at: e.createdAt ?? now,
      imported_at: now,
    }));
}

// Replaces study_words with the current word and pattern entries of every studylang file.
// Entries removed from a file are removed here too. Both files are fetched before
// anything is written, so a failed download leaves the table untouched.
export async function importStudyWords(): Promise<Record<StudySource, number>> {
  const now = new Date().toISOString();
  const sources = Object.keys(STUDY_SOURCES) as StudySource[];
  const perSource = await Promise.all(sources.map((s) => fetchWords(s, now)));
  const rows = perSource.flat();

  if (rows.length) {
    const { error } = await db().from("study_words").upsert(rows, { onConflict: "source,id" });
    if (error) throw error;
  }
  const { error } = await db().from("study_words").delete().lt("imported_at", now);
  if (error) throw error;
  return Object.fromEntries(sources.map((s, i) => [s, perSource[i].length])) as Record<StudySource, number>;
}
