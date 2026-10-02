"use client";

import { useOptimistic, useTransition } from "react";
import { setReread } from "@/app/actions";
import { BookmarkIcon } from "./icons";

// "다시 읽기" pick: groups the article separately on 읽은 글.
export function RereadToggle({ articleId, rereadAt }: { articleId: string; rereadAt: string | null }) {
  const [on, setOptimisticOn] = useOptimistic(!!rereadAt);
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      setOptimisticOn(!on);
      await setReread(articleId, !on);
    });

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={on}
      aria-label={on ? "다시 읽기 취소" : "다시 읽기로 표시"}
      title={on ? "다시 읽기 취소" : "다시 읽기로 표시"}
      className={`shrink-0 rounded-full p-2 transition-colors disabled:opacity-70 ${
        on ? "bg-accent text-white hover:opacity-90" : "border border-line bg-card text-muted hover:border-ink/40 hover:text-ink"
      }`}
    >
      <BookmarkIcon fill={on ? "currentColor" : "none"} />
    </button>
  );
}
