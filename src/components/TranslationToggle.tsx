"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { TRANSLATION_COOKIE, type TranslationMode } from "@/lib/translationMode";

const MODES: { id: TranslationMode; label: string }[] = [
  { id: "hide", label: "원문" },
  { id: "below", label: "원문+번역" },
  { id: "only", label: "번역만" },
  { id: "edit", label: "번역하기" },
];

// Space taken by the sticky nav (same as ReadingPosition).
const TOP_OFFSET = 80;

function saveMode(id: TranslationMode) {
  document.cookie = `${TRANSLATION_COOKIE}=${id}; path=/; samesite=lax; max-age=${60 * 60 * 24 * 400}`;
}

// The paragraph being read (the first one not hidden under the nav), and how far into
// it the top of the screen is, so it can be put back in the same place once the
// page has re-rendered with translations added, removed or swapped in.
type Anchor = { block: number; top: number; ratio: number };

function readAnchor(): Anchor | null {
  for (const el of document.querySelectorAll<HTMLElement>(".reader [data-block]")) {
    const r = el.getBoundingClientRect();
    if (r.bottom <= TOP_OFFSET) continue;
    return { block: Number(el.dataset.block), top: r.top, ratio: r.top < TOP_OFFSET ? (TOP_OFFSET - r.top) / r.height : 0 };
  }
  return null;
}

function restoreAnchor(a: Anchor) {
  const el = document.querySelector<HTMLElement>(`.reader [data-block="${a.block}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const target = a.ratio > 0 ? TOP_OFFSET - a.ratio * r.height : a.top;
  window.scrollBy({ top: r.top - target, behavior: "instant" });
}

function ModeButtons({ current, choose, pending }: { current: TranslationMode; choose: (id: TranslationMode) => void; pending: boolean }) {
  return (
    <div className={`flex rounded-full border border-line bg-paper p-0.5 text-xs ${pending ? "opacity-60" : ""}`}>
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => choose(m.id)}
          aria-pressed={current === m.id}
          className={`rounded-full px-3 py-1 whitespace-nowrap transition-colors ${current === m.id ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// 번역 진행률 and how translations are shown (see translationMode.ts). Once it has been
// scrolled past, a small button in the corner switches modes from where you are reading.
export function TranslationToggle({ mode, done, total }: { mode: TranslationMode; done: number; total: number }) {
  const router = useRouter();
  const [current, setCurrent] = useState(mode);
  const [pending, startTransition] = useTransition();
  const [offscreen, setOffscreen] = useState(false);
  const [open, setOpen] = useState(false);
  const inline = useRef<HTMLDivElement>(null);
  const anchor = useRef<Anchor | null>(null);
  const percent = total ? Math.floor((done / total) * 100) : 0;

  const choose = (id: TranslationMode) => {
    setOpen(false);
    if (id === current) return;
    anchor.current = readAnchor();
    setCurrent(id);
    saveMode(id);
    startTransition(() => router.refresh());
  };

  // The refreshed page is on screen: put the paragraph back where it was.
  useLayoutEffect(() => {
    if (pending || !anchor.current) return;
    restoreAnchor(anchor.current);
    anchor.current = null;
  }, [pending]);

  useEffect(() => {
    const el = inline.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      const past = !e.isIntersecting && e.boundingClientRect.top < 0;
      setOffscreen(past);
      if (!past) setOpen(false);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div ref={inline} data-mdtr-skip="" className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-40 flex-1 items-center gap-2 text-xs text-muted">
          <span className="shrink-0">번역</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
          <span className="shrink-0 tabular-nums">
            {done.toLocaleString()}/{total.toLocaleString()} 문단 ({percent}%)
          </span>
        </div>
        <ModeButtons current={current} choose={choose} pending={pending} />
      </div>

      {offscreen && (
        <div
          data-mdtr-skip=""
          className="fixed right-3 z-30 flex flex-col items-end gap-2 sm:right-6"
          style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {open && (
            <div className="rounded-full shadow-lg">
              <ModeButtons current={current} choose={choose} pending={pending} />
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="번역 보기 방식 바꾸기"
            className={`flex h-10 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium shadow-lg transition-colors ${
              open ? "bg-ink text-paper" : "bg-card text-ink"
            } ${pending ? "opacity-60" : ""}`}
          >
            <span className="font-serif text-sm" aria-hidden="true">
              가
            </span>
            {open ? "닫기" : MODES.find((m) => m.id === current)?.label}
          </button>
        </div>
      )}
    </>
  );
}
