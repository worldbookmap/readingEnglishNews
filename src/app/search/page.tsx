import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ReadStatus } from "@/components/ArticleCard";
import { SOURCE_LABELS } from "@/lib/sources";
import { ARTICLE_SUMMARY_COLUMNS, db, type ArticleSummary } from "@/lib/supabase";

const MIN_QUERY = 2;
const SNIPPETS_SHOWN = 3;

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await connection();
  const q = String((await searchParams).q ?? "").replace(/\s+/g, " ").trim().slice(0, 100);

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">검색</h1>
      <form action="/search" className="mb-8 flex gap-2">
        <input
          name="q"
          type="search"
          defaultValue={q}
          autoFocus={!q}
          placeholder="저장된 기사와 책의 제목·본문에서 찾기"
          className="min-w-0 flex-1 rounded-full border border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink/40"
        />
        <button type="submit" className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90">
          검색
        </button>
      </form>
      {q.length >= MIN_QUERY ? (
        <Suspense key={q} fallback={<p className="p-6 text-center text-sm text-muted">찾는 중…</p>}>
          <Results q={q} />
        </Suspense>
      ) : (
        q && <Empty>두 글자 이상 입력해주세요.</Empty>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</p>;
}

interface Hit {
  article_id: string;
  page: number | null;
  block: number;
  text: string;
}

async function Results({ q }: { q: string }) {
  // PostgREST's or=() filter syntax breaks on these characters.
  const titleTerm = q.replace(/[,()*%\\]/g, " ").trim();
  const [hits, titles] = await Promise.all([
    db().rpc("search_content", { q }),
    titleTerm
      ? db()
          .from("articles")
          .select(ARTICLE_SUMMARY_COLUMNS)
          .or(`title.ilike.*${titleTerm}*,byline.ilike.*${titleTerm}*`)
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (hits.error) throw hits.error;
  if (titles.error) throw titles.error;

  const byArticle = new Map<string, Hit[]>();
  for (const h of (hits.data ?? []) as Hit[]) byArticle.set(h.article_id, [...(byArticle.get(h.article_id) ?? []), h]);
  const titleMatches = new Map(((titles.data ?? []) as ArticleSummary[]).map((a) => [a.id, a]));

  const missing = [...byArticle.keys()].filter((id) => !titleMatches.has(id));
  const rest = missing.length ? await db().from("articles").select(ARTICLE_SUMMARY_COLUMNS).in("id", missing) : { data: [], error: null };
  if (rest.error) throw rest.error;

  const articles = [...titleMatches.values(), ...((rest.data ?? []) as ArticleSummary[])];
  // Title matches first, then the ones that mention the query most.
  const score = (a: ArticleSummary) => (titleMatches.has(a.id) ? 1e6 : 0) + (byArticle.get(a.id)?.length ?? 0);
  articles.sort((a, b) => score(b) - score(a));
  const books = articles.filter((a) => a.source === "book");
  const others = articles.filter((a) => a.source !== "book");

  if (!articles.length) return <Empty>‘{q}’이(가) 들어간 기사나 책이 없어요.</Empty>;
  return (
    <div className="space-y-12">
      {books.length > 0 && <Group title="책" articles={books} hits={byArticle} q={q} />}
      {others.length > 0 && <Group title="기사" articles={others} hits={byArticle} q={q} />}
    </div>
  );
}

function Group({ title, articles, hits, q }: { title: string; articles: ArticleSummary[]; hits: Map<string, Hit[]>; q: string }) {
  const total = articles.reduce((n, a) => n + (hits.get(a.id)?.length ?? 0), 0);
  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2 font-serif text-xl font-semibold">
        {title}
        <span className="font-sans text-sm font-normal text-muted">
          {articles.length}
          {title === "책" ? "권" : "편"}
          {total > 0 && ` · ${total}${total >= 300 ? "+" : ""}곳`}
        </span>
      </h2>
      <ul className="space-y-3">
        {articles.map((a) => (
          <Result key={a.id} article={a} hits={hits.get(a.id) ?? []} q={q} />
        ))}
      </ul>
    </section>
  );
}

function Result({ article: a, hits, q }: { article: ArticleSummary; hits: Hit[]; q: string }) {
  const isBook = a.source === "book";
  const base = isBook ? `/books/${a.id}` : `/articles/${a.id}`;
  const qs = (h: Hit) => `${base}?${isBook ? `page=${h.page}&` : ""}block=${h.block}&q=${encodeURIComponent(q)}`;
  return (
    <li className="rounded-xl border border-line bg-card p-3 sm:p-4">
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="font-medium uppercase tracking-wide">{SOURCE_LABELS[a.source]}</span>
        {a.byline && (
          <>
            <span>·</span>
            <span className="truncate">{a.byline}</span>
          </>
        )}
        <ReadStatus article={a} />
      </div>
      <Link href={base} className="font-serif text-lg leading-snug font-semibold wrap-anywhere hover:underline hover:underline-offset-4">
        <Highlight text={a.title} q={q} />
      </Link>
      {hits.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {hits.slice(0, SNIPPETS_SHOWN).map((h) => (
            <li key={`${h.page}-${h.block}`}>
              <Link href={qs(h)} className="block rounded-lg px-2 py-1.5 -mx-2 text-sm leading-relaxed text-ink/85 hover:bg-accent-soft">
                {isBook && <span className="mr-2 text-xs text-muted tabular-nums">p.{h.page}</span>}
                <Highlight text={snippet(h.text, q)} q={q} />
              </Link>
            </li>
          ))}
          {hits.length > SNIPPETS_SHOWN && (
            <li className="text-xs text-muted">그 밖에 {hits.length - SNIPPETS_SHOWN}곳 더</li>
          )}
        </ul>
      )}
    </li>
  );
}

// About 220 characters of the paragraph around the first match.
function snippet(text: string, q: string) {
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (text.length <= 220 || at < 0) return text.length <= 220 ? text : `${text.slice(0, 220)}…`;
  const start = Math.max(0, at - 80);
  const end = Math.min(text.length, start + 220);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

function Highlight({ text, q }: { text: string; q: string }) {
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-sm bg-word-mark px-0.5 text-ink">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}
