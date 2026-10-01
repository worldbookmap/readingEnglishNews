import { connection } from "next/server";
import { MemorizeList, type MemoEntry } from "@/components/MemorizeList";
import { RefreshStudyWordsButton } from "@/components/RefreshStudyWordsButton";
import { db, type SavedWordRow, type StudyWordRow } from "@/lib/supabase";

export default async function MemorizePage() {
  await connection();
  const [saved, study] = await Promise.all([
    db().from("saved_words").select("word, definition, created_at").order("created_at", { ascending: false }),
    db().from("study_words").select("*").order("created_at", { ascending: false }),
  ]);
  if (saved.error) throw saved.error;
  if (study.error) throw study.error;

  // A word saved from several articles appears once, with the first definition found.
  const fromArticles = new Map<string, MemoEntry>();
  for (const w of (saved.data ?? []) as Pick<SavedWordRow, "word" | "definition" | "created_at">[]) {
    const e = fromArticles.get(w.word);
    if (e) e.meaning ??= w.definition;
    else fromArticles.set(w.word, { key: `a:${w.word}`, word: w.word, meaning: w.definition, source: "article", createdAt: w.created_at });
  }
  const studyWords = (study.data ?? []) as StudyWordRow[];
  const entries: MemoEntry[] = [
    ...fromArticles.values(),
    ...studyWords.map((w) => ({ key: `s:${w.id}`, word: w.word, meaning: w.meaning, source: "study" as const, createdAt: w.created_at })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const lastImported = studyWords.reduce<string | null>((m, w) => (!m || w.imported_at > m ? w.imported_at : m), null);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{entries.length}개 단어</p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">암기장</h1>
        </div>
        <RefreshStudyWordsButton lastImported={lastImported} />
      </div>
      <MemorizeList entries={entries} />
    </div>
  );
}
