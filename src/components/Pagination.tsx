import Link from "next/link";

// (1) (2) … page links for a book. Long books show the first/last page and a window
// around the current one.
export function Pagination({ href, page, count }: { href: (page: number) => string; page: number; count: number }) {
  if (count <= 1) return null;
  const around = new Set([1, count, page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= count));
  const pages = [...around].sort((a, b) => a - b);

  const pill = "inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm tabular-nums transition-colors";
  return (
    <nav aria-label="페이지" className="flex flex-wrap items-center justify-center gap-1">
      {page > 1 && (
        <Link href={href(page - 1)} className={`${pill} text-muted hover:text-ink`} aria-label="이전 페이지">
          ‹ 이전
        </Link>
      )}
      {pages.map((p, i) => (
        <span key={p} className="contents">
          {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
          {p === page ? (
            <span aria-current="page" className={`${pill} bg-ink font-medium text-paper`}>
              ({p})
            </span>
          ) : (
            <Link href={href(p)} className={`${pill} border border-line bg-card text-muted hover:border-ink/40 hover:text-ink`}>
              ({p})
            </Link>
          )}
        </span>
      ))}
      {page < count && (
        <Link href={href(page + 1)} className={`${pill} text-muted hover:text-ink`} aria-label="다음 페이지">
          다음 ›
        </Link>
      )}
    </nav>
  );
}
