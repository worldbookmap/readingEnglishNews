"use client";

import { useState, useTransition } from "react";
import { refreshStudyWords } from "@/app/actions";
import { STUDY_SOURCES, type StudySource } from "@/lib/studySources";

export function RefreshStudyWordsButton({ lastImported }: { lastImported: string | null }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const status =
    message ??
    (lastImported
      ? `studylang · ${new Date(lastImported).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}`
      : "studylang 단어를 아직 불러오지 않았어요");

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted">{status}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(null);
            try {
              const r = await refreshStudyWords();
              setMessage(
                `${(Object.keys(r) as StudySource[]).map((s) => `${STUDY_SOURCES[s]} ${r[s]}개`).join(", ")}를 불러왔어요`,
              );
            } catch {
              setMessage("불러오지 못했어요");
            }
          })
        }
        className="rounded-full border border-line bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-ink/40 disabled:opacity-60"
      >
        {pending ? "불러오는 중…" : "새로 불러오기"}
      </button>
    </div>
  );
}
