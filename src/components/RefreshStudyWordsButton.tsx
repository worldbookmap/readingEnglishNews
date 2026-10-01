"use client";

import { useState, useTransition } from "react";
import { refreshStudyWords } from "@/app/actions";
import { RefreshIcon } from "./icons";
import { STUDY_SOURCE_LABELS, type StudySource } from "@/lib/studySources";

export function RefreshStudyWordsButton({ lastImported }: { lastImported: string | null }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const status =
    message ??
    (lastImported
      ? `마지막으로 불러옴 · ${new Date(lastImported).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}`
      : "콜리·뱁찌 단어를 아직 불러오지 않았어요");

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 text-right text-xs text-muted" aria-live="polite">
        {status}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(null);
            try {
              const r = await refreshStudyWords();
              setMessage(
                `${(Object.keys(r) as StudySource[]).map((s) => `${STUDY_SOURCE_LABELS[s]} ${r[s]}개`).join(", ")}를 불러왔어요`,
              );
            } catch {
              setMessage("불러오지 못했어요");
            }
          })
        }
        aria-label={pending ? "불러오는 중" : "새로 불러오기"}
        title="새로 불러오기"
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-card text-muted transition-colors hover:border-ink/40 hover:text-ink disabled:opacity-60"
      >
        <RefreshIcon className={pending ? "animate-spin" : undefined} />
      </button>
    </div>
  );
}
