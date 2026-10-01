import { connection } from "next/server";
import { ArticleCard } from "@/components/ArticleCard";
import { ARTICLE_SUMMARY_COLUMNS, db, type ArticleSummary } from "@/lib/supabase";

export default async function HistoryPage() {
  await connection();
  const { data, error } = await db()
    .from("articles")
    .select(ARTICLE_SUMMARY_COLUMNS)
    .not("last_read_at", "is", null)
    .order("last_read_at", { ascending: false });
  if (error) throw error;
  const articles = (data ?? []) as ArticleSummary[];
  const totalWords = articles.reduce((n, a) => n + a.word_count, 0);

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-muted">
          {articles.length}편 · 약 {totalWords.toLocaleString()} 단어
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">읽은 글</h1>
      </div>
      {articles.length ? (
        <div className="space-y-3">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} showRank={false} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">아직 읽은 글이 없어요.</p>
      )}
    </div>
  );
}
