import "server-only";
import { STUDY_SOURCES, type StudySource } from "./studySources";
import { db } from "./supabase";

// studylang keeps its entries in Supabase and serves them through this route.
const entriesUrl = (source: StudySource) =>
  `https://studylangu.vercel.app/api/entries?user=${STUDY_SOURCES[source]}`;

// Entry types brought into the 암기장; shadowing sentences are left out.
const IMPORTED_TYPES = new Set(["word", "pattern"]);

interface StudyEntry {
  id: string;
  type: string;
  english: string;
  korean: string;
  createdAt: string;
}

async function fetchWords(source: StudySource, now: string) {
  const res = await fetch(entriesUrl(source), { cache: "no-store" });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(`studylang ${source}: HTTP ${res.status}${error ? ` (${error})` : ""}`);
  }
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

// Replaces study_words with the current word and pattern entries of every studylang profile.
// Entries deleted in studylang are removed here too. Every profile is fetched before
// anything is written, so a failed request leaves the table untouched.
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
