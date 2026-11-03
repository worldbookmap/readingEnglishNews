"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import type { DailyReading } from "@/lib/dailyReading";

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

export function DailyReadingOverlay({ reading }: { reading: DailyReading }) {
  // Closed on the server, so it appears (fading in) once the page is interactive.
  const closed = useSyncExternalStore(subscribe, isClosed, () => true);

  useEffect(() => {
    if (closed) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [closed]);

  if (closed) return null;
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && close()}
      className="daily-reading fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px] sm:p-8"
    >
      <article
        role="dialog"
        aria-modal="true"
        aria-label={`${reading.date} ${reading.title}`}
        className="max-h-full w-full max-w-xl overflow-y-auto rounded-2xl bg-card px-6 py-8 shadow-2xl sm:px-10 sm:py-10"
      >
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
        <div className="mt-8 flex items-center justify-between gap-4 border-t border-line pt-4 text-sm">
          <Link
            href={`/books/${reading.bookId}?page=${reading.page}&block=${reading.block}`}
            onClick={close}
            className="text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            책에서 읽기 ›
          </Link>
          <button type="button" onClick={close} className="rounded-full border border-line px-4 py-1.5 text-muted hover:border-ink/40 hover:text-ink">
            닫기
          </button>
        </div>
      </article>
    </div>
  );
}
