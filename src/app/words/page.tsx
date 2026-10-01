import { connection } from "next/server";
import { WordList, type WordWithArticle } from "@/components/WordList";
import { db } from "@/lib/supabase";

export default async function WordsPage() {
  await connection();
  const { data, error } = await db()
    .from("saved_words")
    .select("*, article:articles(id, title, source)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const words = (data ?? []) as WordWithArticle[];

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-muted">{new Set(words.map((w) => w.word)).size}개 단어</p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">단어장</h1>
      </div>
      <WordList words={words} />
    </div>
  );
}
