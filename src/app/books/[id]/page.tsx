import { notFound } from "next/navigation";
import { readingMinutes } from "@/components/ArticleCard";
import { DeleteArticleButton } from "@/components/DeleteArticleButton";
import { OpenBookPage } from "@/components/OpenBookPage";
import { Pagination } from "@/components/Pagination";
import { ReadToggle } from "@/components/ReadToggle";
import { RereadToggle } from "@/components/RereadToggle";
import { Reader } from "@/components/Reader";
import {
  ARTICLE_SUMMARY_COLUMNS,
  db,
  type ArticleSummary,
  type BookPageRow,
  type SavedSentenceRow,
  type SavedWordRow,
} from "@/lib/supabase";

export default async function BookPage({ params, searchParams }: PageProps<"/books/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const book = await db().from("articles").select(ARTICLE_SUMMARY_COLUMNS).eq("id", id).eq("source", "book").maybeSingle();
  if (book.error) throw book.error;
  if (!book.data) notFound();
  const b = book.data as ArticleSummary;

  // Without ?page=, resume where the reader left off.
  const requested = Number((await searchParams).page);
  const page = Math.min(Math.max(Number.isInteger(requested) ? requested : b.current_page, 1), Math.max(b.page_count, 1));

  const [pageRes, words, sentences] = await Promise.all([
    db().from("book_pages").select("*").eq("article_id", id).eq("page", page).maybeSingle(),
    db().from("saved_words").select("*").eq("article_id", id),
    db().from("saved_sentences").select("*").eq("article_id", id),
  ]);
  if (pageRes.error) throw pageRes.error;
  const p = pageRes.data as BookPageRow | null;
  const href = (n: number) => `/books/${id}?page=${n}`;

  return (
    <article className="mx-auto max-w-2xl">
      <OpenBookPage articleId={id} page={page} />
      <header className="mb-8 border-b border-line pb-6">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide text-accent">책</span>
          <span>·</span>
          <span>
            {b.word_count.toLocaleString()} words, {b.page_count}페이지
          </span>
          <span>·</span>
          <span>
            {page}/{b.page_count}페이지 {p ? `(${readingMinutes(p.word_count)}분)` : ""}
          </span>
        </div>
        <h1 className="font-serif text-3xl leading-tight font-semibold tracking-tight wrap-anywhere sm:text-4xl">{b.title}</h1>
        {b.byline && <p className="mt-3 text-sm text-muted">{b.byline}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {b.url.startsWith("http") ? (
            <a href={b.url} target="_blank" rel="noreferrer" className="text-sm text-muted underline underline-offset-4 hover:text-ink">
              {b.url.startsWith("https://archive.org/") ? "Internet Archive" : "Project Gutenberg"} ↗
            </a>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <DeleteArticleButton
              articleId={id}
              savedCount={(words.data?.length ?? 0) + (sentences.data?.length ?? 0)}
              noun="책"
            />
            <RereadToggle articleId={id} rereadAt={b.reread_at} />
            <ReadToggle articleId={id} readAt={b.read_at} />
          </div>
        </div>
        <div className="mt-6">
          <Pagination href={href} page={page} count={b.page_count} />
        </div>
      </header>

      {p ? (
        <Reader
          key={page}
          articleId={id}
          blocks={p.blocks}
          initialWords={(words.data ?? []) as SavedWordRow[]}
          initialSentences={(sentences.data ?? []) as SavedSentenceRow[]}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">이 페이지를 찾을 수 없어요.</p>
      )}

      <div className="mt-10 space-y-6 border-t border-line pt-6">
        <Pagination href={href} page={page} count={b.page_count} />
        {page >= b.page_count && <ReadToggle articleId={id} readAt={b.read_at} size="lg" />}
      </div>
    </article>
  );
}
