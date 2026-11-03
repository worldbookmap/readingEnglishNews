"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { DailyProgramme, DailyReading } from "@/lib/dailyReading";

// Shown once per visit (browser session): closing it keeps it closed when coming back
// to the home page, until the site is opened again.
const KEY = "daily-reading-closed";
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const isClosed = () => sessionStorage.getItem(KEY) === "1";
const close = () => {
  sessionStorage.setItem(KEY, "1");
  listeners.forEach((fn) => fn());
};

const linkClass = "text-muted underline-offset-4 hover:text-ink hover:underline";
const buttonClass = "rounded-full border border-line px-4 py-1.5 text-muted hover:border-ink/40 hover:text-ink";

// Today's meditation, then the newest BBC Learning English programme (whichever exist).
export function DailyReadingOverlay({ reading, programme }: { reading: DailyReading | null; programme: DailyProgramme | null }) {
  // Closed on the server, so it appears (fading in) once the page is interactive.
  const closed = useSyncExternalStore(subscribe, isClosed, () => true);
  const pages = [reading && ("reading" as const), programme && ("programme" as const)].filter((p) => p !== null);
  const [index, setIndex] = useState(0);
  const page = pages[Math.min(index, pages.length - 1)];
  const last = pages.length - 1;

  useEffect(() => {
    if (closed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, last));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [closed, last]);

  if (closed || !page) return null;
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && close()}
      className="daily-reading fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px] sm:p-8"
    >
      <article
        role="dialog"
        aria-modal="true"
        aria-label={page === "reading" ? `${reading!.date} ${reading!.title}` : programme!.title}
        className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
      >
        {/* A new key per page starts it scrolled to the top. */}
        <div key={page} className="overflow-y-auto px-6 py-8 sm:px-10 sm:py-10">
          {page === "reading" ? <Meditation reading={reading!} /> : <Programme programme={programme!} />}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-6 py-4 text-sm sm:px-10">
          {page === "reading" ? (
            <Link href={`/books/${reading!.bookId}?page=${reading!.page}&block=${reading!.block}`} onClick={close} className={linkClass}>
              책에서 읽기 ›
            </Link>
          ) : (
            <Link href={`/articles/${programme!.id}`} onClick={close} className={linkClass}>
              기사로 읽기 ›
            </Link>
          )}
          {pages.length > 1 && (
            <div className="flex gap-1.5" aria-hidden>
              {pages.map((p, i) => (
                <span key={p} className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-ink" : "bg-line"}`} />
              ))}
            </div>
          )}
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" onClick={() => setIndex(index - 1)} className={buttonClass}>
                ‹ 이전
              </button>
            )}
            {index < last ? (
              <button type="button" onClick={() => setIndex(index + 1)} className={buttonClass}>
                다음 ›
              </button>
            ) : (
              <button type="button" onClick={close} className={buttonClass}>
                닫기
              </button>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}

function Meditation({ reading }: { reading: DailyReading }) {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-accent">The Daily Stoic · {reading.date}</p>
      <h2 className="mt-2 font-serif text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">{reading.title}</h2>
      <div className="mt-6 space-y-4 font-serif text-[1.075rem] leading-relaxed">
        {reading.blocks.map((b, i) =>
          b.kind === "source" ? (
            <p key={i} className="text-right text-sm text-muted">
              {b.text}
            </p>
          ) : b.kind === "quote" ? (
            <blockquote key={i} className="border-l-2 border-accent/60 pl-4 italic">
              {b.text}
            </blockquote>
          ) : (
            <p key={i}>{b.text}</p>
          ),
        )}
      </div>
    </>
  );
}

function Programme({ programme }: { programme: DailyProgramme }) {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-accent">
        BBC Learning English{programme.series ? ` · ${programme.series}` : ""}
      </p>
      <h2 className="mt-2 font-serif text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">{programme.title}</h2>
      <a href={programme.url} target="_blank" rel="noreferrer" className={`mt-2 inline-block text-sm ${linkClass}`}>
        BBC에서 듣기 ↗
      </a>
      <div className="mt-6 space-y-4 font-serif text-[1.075rem] leading-relaxed">
        {programme.blocks.map((b, i) =>
          b.type === "img" ? null : b.type === "h" ? (
            <h3 key={i} className="pt-2 font-sans text-xs font-semibold uppercase tracking-[0.15em] text-muted">
              {b.text}
            </h3>
          ) : b.type === "li" ? (
            <p key={i} className="border-l-2 border-line pl-4 text-muted italic">
              {b.text}
            </p>
          ) : (
            <p key={i}>{b.text}</p>
          ),
        )}
      </div>
    </>
  );
}
