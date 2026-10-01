import Link from "next/link";
import { SOURCE_LABELS } from "@/lib/sources";
import type { ArticleSummary } from "@/lib/supabase";

export function formatDate(iso: string | null, withTime = false) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(iso));
}

export const readingMinutes = (words: number) => Math.max(1, Math.round(words / 220));

export function ArticleCard({ article, showRank = true }: { article: ArticleSummary; showRank?: boolean }) {
  return (
    <Link
      href={`/articles/${article.id}`}
      className="group flex gap-4 rounded-xl border border-line bg-card p-3 transition-colors hover:border-ink/30 sm:p-4"
    >
      {showRank && (
        <span className="w-6 shrink-0 pt-0.5 text-right font-serif text-2xl font-semibold text-accent tabular-nums">
          {article.popular_rank}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted">
          <span className="font-medium uppercase tracking-wide">{SOURCE_LABELS[article.source]}</span>
          <span>·</span>
          <span>{article.word_count ? `${readingMinutes(article.word_count)}분` : "본문 붙여넣기 필요"}</span>
          <ReadStatus article={article} />
        </div>
        <h3 className="font-serif text-lg leading-snug font-semibold group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">
          {article.title}
        </h3>
        {article.excerpt && <p className="mt-1 line-clamp-2 text-sm text-muted">{article.excerpt}</p>}
      </div>
      {article.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.image_url}
          alt=""
          loading="lazy"
          className="hidden h-20 w-28 shrink-0 rounded-lg object-cover sm:block"
        />
      )}
    </Link>
  );
}

export function ReadStatus({ article }: { article: ArticleSummary }) {
  if (article.read_at) {
    return (
      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
        읽었음 {formatDate(article.read_at)}
      </span>
    );
  }
  if (article.last_opened_at) {
    return (
      <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
        클릭함 {formatDate(article.last_opened_at)}
      </span>
    );
  }
  return null;
}
