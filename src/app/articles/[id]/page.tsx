import { notFound } from "next/navigation";
import { formatDate, readingMinutes } from "@/components/ArticleCard";
import { MarkOpened } from "@/components/MarkOpened";
import { PasteBody } from "@/components/PasteBody";
import { ReadToggle } from "@/components/ReadToggle";
import { Reader } from "@/components/Reader";
import { SOURCE_LABELS } from "@/lib/sources";
import { db, type ArticleRow, type SavedSentenceRow, type SavedWordRow } from "@/lib/supabase";

export default async function ArticlePage({ params }: PageProps<"/articles/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [article, words, sentences] = await Promise.all([
    db().from("articles").select("*").eq("id", id).maybeSingle(),
    db().from("saved_words").select("*").eq("article_id", id),
    db().from("saved_sentences").select("*").eq("article_id", id),
  ]);
  if (article.error) throw article.error;
  if (!article.data) notFound();
  const a = article.data as ArticleRow;

  return (
    <article className="mx-auto max-w-2xl">
      <MarkOpened articleId={a.id} />
      <header className="mb-8 border-b border-line pb-6">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide text-accent">{SOURCE_LABELS[a.source]}</span>
          <span>·</span>
          <span>인기 {a.popular_rank}위</span>
          {a.published_at && (
            <>
              <span>·</span>
              <span>{formatDate(a.published_at)}</span>
            </>
          )}
          <span>·</span>
          <span>
            {a.word_count ? `${a.word_count.toLocaleString()} words, ${readingMinutes(a.word_count)}분` : "본문 없음"}
          </span>
        </div>
        <h1 className="font-serif text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{a.title}</h1>
        {a.byline && <p className="mt-3 text-sm text-muted">{a.byline}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <a href={a.url} target="_blank" rel="noreferrer" className="text-sm text-muted underline underline-offset-4 hover:text-ink">
            원문 보기 ↗
          </a>
          <ReadToggle articleId={a.id} readAt={a.read_at} />
        </div>
      </header>
      {a.blocks.length ? (
        <>
          <Reader
            articleId={a.id}
            blocks={a.blocks}
            initialWords={(words.data ?? []) as SavedWordRow[]}
            initialSentences={(sentences.data ?? []) as SavedSentenceRow[]}
          />
          <div className="mt-10">
            <ReadToggle articleId={a.id} readAt={a.read_at} size="lg" />
          </div>
        </>
      ) : (
        <PasteBody articleId={a.id} url={a.url} excerpt={a.excerpt} />
      )}
    </article>
  );
}
