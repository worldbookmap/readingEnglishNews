"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TRANSLATION_COOKIE, type TranslationMode } from "@/lib/translationMode";

const MODES: { id: TranslationMode; label: string }[] = [
  { id: "hide", label: "원문" },
  { id: "below", label: "원문+번역" },
  { id: "only", label: "번역만" },
];

function saveMode(id: TranslationMode) {
  document.cookie = `${TRANSLATION_COOKIE}=${id}; path=/; samesite=lax; max-age=${60 * 60 * 24 * 400}`;
}

// 번역 진행률 and how translations are shown (see translationMode.ts).
export function TranslationToggle({ mode, done, total }: { mode: TranslationMode; done: number; total: number }) {
  const router = useRouter();
  const [current, setCurrent] = useState(mode);
  const [pending, startTransition] = useTransition();
  const percent = total ? Math.floor((done / total) * 100) : 0;

  const choose = (id: TranslationMode) => {
    setCurrent(id);
    saveMode(id);
    startTransition(() => router.refresh());
  };

  return (
    <div data-mdtr-skip="" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-40 flex-1 items-center gap-2 text-xs text-muted">
        <span className="shrink-0">번역</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
        <span className="shrink-0 tabular-nums">
          {done.toLocaleString()}/{total.toLocaleString()} 문단 ({percent}%)
        </span>
      </div>
      <div className={`flex rounded-full border border-line p-0.5 text-xs ${pending ? "opacity-60" : ""}`}>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => choose(m.id)}
            aria-pressed={current === m.id}
            className={`rounded-full px-3 py-1 transition-colors ${current === m.id ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
