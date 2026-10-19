"use client";

import { useEffect, useRef, useState } from "react";
import { saveBookPosition } from "@/app/actions";

// Space taken by the sticky nav, so the resumed paragraph isn't hidden under it.
const TOP_OFFSET = 80;

const blockEls = () => [...document.querySelectorAll<HTMLElement>(".reader [data-block]")];

// Remembers which paragraph of a book page is at the top of the screen, and scrolls
// back to it when the book is reopened.
export function ReadingPosition({ articleId, page, resumeBlock }: { articleId: string; page: number; resumeBlock: number }) {
  const [resumed, setResumed] = useState(false);
  const lastSaved = useRef(resumeBlock);

  useEffect(() => {
    if (resumeBlock <= 0) return;
    // After Next.js has scrolled to the top for the navigation.
    const t = window.setTimeout(() => {
      const el = blockEls().find((e) => Number(e.dataset.block) === resumeBlock);
      if (!el) return;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - TOP_OFFSET });
      setResumed(true);
    }, 50);
    const hide = window.setTimeout(() => setResumed(false), 5000);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(hide);
    };
  }, [resumeBlock]);

  useEffect(() => {
    let timer: number | undefined;
    const save = () => {
      const top = blockEls().find((e) => e.getBoundingClientRect().bottom > TOP_OFFSET);
      const block = top ? Number(top.dataset.block) : 0;
      if (block === lastSaved.current) return;
      lastSaved.current = block;
      saveBookPosition(articleId, page, block).catch(() => {});
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(save, 1000);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, [articleId, page]);

  if (!resumed) return null;
  return (
    <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full bg-ink px-4 py-2 text-sm text-paper shadow-lg">
        <span>마지막으로 읽던 곳이에요</span>
        <button
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            setResumed(false);
          }}
          className="font-medium underline underline-offset-4"
        >
          페이지 처음부터
        </button>
      </div>
    </div>
  );
}
