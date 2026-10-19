import { connection } from "next/server";
import { Suspense } from "react";
import { AddBookForm } from "@/components/AddBookForm";
import { ArticleCard } from "@/components/ArticleCard";
import { ImportBookButton } from "@/components/ImportBookButton";
import { gutenbergUrl, searchPublicBooks } from "@/lib/books";
import { ARTICLE_SUMMARY_COLUMNS, db, type ArticleSummary } from "@/lib/supabase";

// Importing a public book downloads and splits a few hundred KB of text.
export const maxDuration = 60;

export default async function BooksPage({ searchParams }: PageProps<"/books">) {
  await connection();
  const q = String((await searchParams).q ?? "").trim().slice(0, 100);
  const { data, error } = await db()
    .from("articles")
    .select(ARTICLE_SUMMARY_COLUMNS)
    .eq("source", "book")
    .order("last_opened_at", { ascending: false, nullsFirst: false })
    .order("fetched_at", { ascending: false });
  if (error) throw error;
  const books = (data ?? []) as ArticleSummary[];

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm text-muted">{books.length ? `${books.length}권` : "아직 책이 없어요"}</p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">책</h1>
      </div>

      {books.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {books.map((b) => (
            <ArticleCard key={b.id} article={b} showRank={false} />
          ))}
        </div>
      )}

      <section className="mt-14" id="search">
        <h2 className="mb-1 font-serif text-xl font-semibold">공개된 책 가져오기</h2>
        <p className="mb-4 text-sm text-muted">
          저작권이 끝난 영어책을{" "}
          <a href="https://www.gutenberg.org/" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">
            Project Gutenberg
          </a>
          에서 찾아 가져와요.
        </p>
        <form action="/books#search" className="mb-5 flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="제목이나 지은이 (예: Pride and Prejudice, Sherlock Holmes)"
            className="min-w-0 flex-1 rounded-full border border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink/40"
          />
          <button type="submit" className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90">
            검색
          </button>
        </form>
        <Suspense key={q} fallback={<p className="p-6 text-center text-sm text-muted">찾는 중…</p>}>
          <PublicBookResults query={q} importedUrls={new Set(books.map((b) => b.url))} />
        </Suspense>
      </section>

      <section className="mt-14">
        <h2 className="mb-1 font-serif text-xl font-semibold">직접 입력</h2>
        <p className="mb-4 text-sm text-muted">갖고 있는 책이나 글을 붙여넣으면 페이지로 나눠서 기사처럼 읽을 수 있어요.</p>
        <div className="rounded-2xl border border-line bg-card p-4 sm:p-5">
          <AddBookForm />
        </div>
      </section>
    </div>
  );
}

async function PublicBookResults({ query, importedUrls }: { query: string; importedUrls: Set<string> }) {
  let results;
  try {
    results = await searchPublicBooks(query);
  } catch {
    return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">검색하지 못했어요. 잠시 후 다시 시도해주세요.</p>;
  }
  if (!results.length) {
    return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">찾는 책이 없어요.</p>;
  }
  return (
    <div>
      {!query && <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted">많이 읽는 책</h3>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {results.map((b) => (
          <li key={b.id} className="flex gap-3 rounded-xl border border-line bg-card p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.coverUrl} alt="" loading="lazy" className="h-20 w-14 shrink-0 rounded bg-line object-cover" />
            <div className="min-w-0 flex-1">
              <p className="font-serif leading-snug font-semibold wrap-anywhere">{b.title}</p>
              {b.author && <p className="mt-0.5 truncate text-sm text-muted">{b.author}</p>}
            </div>
            <ImportBookButton gutenbergId={b.id} imported={importedUrls.has(gutenbergUrl(b.id))} />
          </li>
        ))}
      </ul>
    </div>
  );
}
