"use client";

import { useOptimistic, useTransition } from "react";
import { setRead } from "@/app/actions";

// "읽었음" toggle. Opening an article only counts as "클릭함"; the reader decides
// when it's actually read.
export function ReadToggle({ articleId, readAt, size = "sm" }: { articleId: string; readAt: string | null; size?: "sm" | "lg" }) {
  const [read, setOptimisticRead] = useOptimistic(!!readAt);
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      setOptimisticRead(!read);
      await setRead(articleId, !read);
    });

  const base =
    size === "lg"
      ? "w-full rounded-2xl px-5 py-4 text-base font-semibold"
      : "rounded-full px-4 py-1.5 text-sm font-medium";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={read}
      className={`${base} transition-colors disabled:opacity-70 ${
        read ? "bg-accent text-white hover:opacity-90" : "border border-line bg-card text-ink hover:border-ink/40"
      }`}
    >
      {read ? "✓ 읽었음" : size === "lg" ? "다 읽었어요 · 읽었음으로 표시" : "읽었음으로 표시"}
    </button>
  );
}
