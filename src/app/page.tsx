import Link from "next/link";
import { connection } from "next/server";
import { AddArticleForm } from "@/components/AddArticleForm";
import { ArticleCard } from "@/components/ArticleCard";
import { FetchNowButton } from "@/components/FetchNowButton";
import { SOURCE_LABELS, SOURCES } from "@/lib/sources";
import { ARTICLE_SUMMARY_COLUMNS, db, type ArticleSummary } from "@/lib/supabase";

// Allows the "fetch now" server action (which scrapes ~10 pages) enough time on Vercel.
export const maxDuration = 60;

// 직접 추가한 기사: show the newest few, "불러오기" reveals older ones in steps.
const ADDED_INITIAL = 4;
const ADDED_STEP = 10;

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  await connection();
  const params = await searchParams;
  const addedParam = Number(params.added);
  const addedLimit = Number.isInteger(addedParam) && addedParam > ADDED_INITIAL ? addedParam : ADDED_INITIAL;
  const [popularRes, addedRes] = await Promise.all([
    db()
      .from("articles")
      .select(ARTICLE_SUMMARY_COLUMNS)
      .neq("source", "custom")
      .order("popular_on", { ascending: false })
      .order("popular_rank", { ascending: true })
      .limit(200),
    db()
      .from("articles")
      .select(ARTICLE_SUMMARY_COLUMNS)
      .eq("source", "custom")
      .order("fetched_at", { ascending: false })
      .limit(addedLimit + 1),
  ]);
  if (popularRes.error) throw popularRes.error;
  if (addedRes.error) throw addedRes.error;
  const articles = (popularRes.data ?? []) as ArticleSummary[];
  const addedAll = (addedRes.data ?? []) as ArticleSummary[];
  const added = addedAll.slice(0, addedLimit);
  const hasMoreAdded = addedAll.length > addedLimit;

  const days = [...new Set(articles.map((a) => a.popular_on))];
  const [latest, ...older] = days;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{latest ? dayLabel(latest) : "아직 기사가 없어요"}</p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">어제의 인기 기사</h1>
        </div>
        <FetchNowButton />
      </div>

      <AddArticleForm error={params.addError === "1"} />

      {!latest && (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
          매일 아침 7시에 자동으로 불러와요. 지금 바로 받으려면 &lsquo;지금 불러오기&rsquo;를 눌러주세요.
        </p>
      )}

      {latest && <DayGroup articles={articles.filter((a) => a.popular_on === latest)} />}

      {added.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 font-serif text-xl font-semibold">직접 추가한 기사</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {added.map((a) => (
              <ArticleCard key={a.id} article={a} showRank={false} />
            ))}
          </div>
          {hasMoreAdded && (
            <div className="mt-4 text-center">
              <Link
                href={`/?added=${addedLimit + ADDED_STEP}`}
                scroll={false}
                className="inline-block rounded-full border border-line bg-card px-5 py-2 text-sm text-muted transition-colors hover:border-ink/40 hover:text-ink"
              >
                불러오기
              </Link>
            </div>
          )}
        </section>
      )}

      {older.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 font-serif text-xl font-semibold">지난 인기 기사</h2>
          <div className="space-y-3">
            {older.map((day) => (
              <details key={day} className="group rounded-xl border border-line bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
                  <span className="font-medium">{dayLabel(day)}</span>
                  <span className="text-sm text-muted">
                    {articles.filter((a) => a.popular_on === day).length}개
                    <span className="ml-2 inline-block transition-transform group-open:rotate-90">›</span>
                  </span>
                </summary>
                <div className="border-t border-line p-3 sm:p-4">
                  <DayGroup articles={articles.filter((a) => a.popular_on === day)} />
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DayGroup({ articles }: { articles: ArticleSummary[] }) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {SOURCES.map((s) => {
        const list = articles.filter((a) => a.source === s);
        if (!list.length) return null;
        return (
          <section key={s}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted">{SOURCE_LABELS[s]}</h2>
            <div className="space-y-3">
              {list.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
