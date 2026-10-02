import { connection } from "next/server";
import { ArticleCard } from "@/components/ArticleCard";
import { RereadToggle } from "@/components/RereadToggle";
import { ARTICLE_SUMMARY_COLUMNS, db, type ArticleSummary } from "@/lib/supabase";

export default async function HistoryPage() {
  await connection();
  const { data, error } = await db()
    .from("articles")
    .select(ARTICLE_SUMMARY_COLUMNS)
    .or("read_at.not.is.null,last_opened_at.not.is.null,reread_at.not.is.null")
    .order("last_opened_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  const all = (data ?? []) as ArticleSummary[];

  // Articles picked to read again get their own group and leave the other two.
  const reread = all.filter((a) => a.reread_at).sort((a, b) => b.reread_at!.localeCompare(a.reread_at!));
  const read = all.filter((a) => a.read_at && !a.reread_at).sort((a, b) => b.read_at!.localeCompare(a.read_at!));
  const clicked = all.filter((a) => !a.read_at && !a.reread_at);
  const totalWords = all.filter((a) => a.read_at).reduce((n, a) => n + a.word_count, 0);

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm text-muted">
          읽었음 {all.filter((a) => a.read_at).length}편 · 약 {totalWords.toLocaleString()} 단어
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">읽은 글</h1>
      </div>

      <Section title="다시 읽을 글" count={reread.length} empty="글 오른쪽의 책갈피를 누르면 다시 읽을 글로 여기에 모여요.">
        {reread.map((a) => (
          <Row key={a.id} article={a} />
        ))}
      </Section>

      <Section title="읽었음" count={read.length} empty="기사 화면에서 '읽었음으로 표시'를 누르면 여기에 모여요." className="mt-12">
        {read.map((a) => (
          <Row key={a.id} article={a} />
        ))}
      </Section>

      <Section title="클릭함" count={clicked.length} empty="열어보기만 한 글이 여기에 남아요." className="mt-12">
        {clicked.map((a) => (
          <Row key={a.id} article={a} />
        ))}
      </Section>
    </div>
  );
}

function Row({ article }: { article: ArticleSummary }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <ArticleCard article={article} showRank={false} />
      </div>
      <RereadToggle articleId={article.id} rereadAt={article.reread_at} />
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  className = "",
  children,
}: {
  title: string;
  count: number;
  empty: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        {title} <span className="ml-1 font-normal">{count}</span>
      </h2>
      {count ? (
        <div className="space-y-3">{children}</div>
      ) : (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{empty}</p>
      )}
    </section>
  );
}
