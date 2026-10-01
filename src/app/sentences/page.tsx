import { connection } from "next/server";
import { SentenceList, type SentenceWithArticle } from "@/components/SentenceList";
import { db } from "@/lib/supabase";

export default async function SentencesPage() {
  await connection();
  const { data, error } = await db()
    .from("saved_sentences")
    .select("*, article:articles(id, title, source)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const sentences = (data ?? []) as SentenceWithArticle[];

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-muted">{sentences.length}개 문장</p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">저장한 문장</h1>
      </div>
      <SentenceList sentences={sentences} />
    </div>
  );
}
