import Link from "next/link";
import { connection } from "next/server";
import { SentenceList, type SentenceWithArticle } from "@/components/SentenceList";
import { WordList, type WordWithArticle } from "@/components/WordList";
import { db } from "@/lib/supabase";

// Saved words and saved sentences share one tab; ?tab=sentences switches the list.
export default async function WordsPage({ searchParams }: PageProps<"/words">) {
  await connection();
  const tab = (await searchParams).tab === "sentences" ? "sentences" : "words";
  const [wordsRes, sentencesRes] = await Promise.all([
    db().from("saved_words").select("*, article:articles(id, title, source)").order("created_at", { ascending: false }),
    db().from("saved_sentences").select("*, article:articles(id, title, source)").order("created_at", { ascending: false }),
  ]);
  if (wordsRes.error) throw wordsRes.error;
  if (sentencesRes.error) throw sentencesRes.error;
  const words = (wordsRes.data ?? []) as WordWithArticle[];
  const sentences = (sentencesRes.data ?? []) as SentenceWithArticle[];

  const tabs = [
    { id: "words", href: "/words", label: "단어", count: new Set(words.map((w) => w.word)).size },
    { id: "sentences", href: "/words?tab=sentences", label: "문장", count: sentences.length },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">단어 · 문장</h1>
        <div className="mt-3 inline-flex rounded-full border border-line bg-card p-1">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              replace
              scroll={false}
              aria-current={tab === t.id ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                tab === t.id ? "bg-ink text-paper" : "text-muted hover:text-ink"
              }`}
            >
              {t.label} <span className="tabular-nums opacity-70">{t.count}</span>
            </Link>
          ))}
        </div>
      </div>
      {tab === "words" ? <WordList words={words} /> : <SentenceList sentences={sentences} />}
    </div>
  );
}
