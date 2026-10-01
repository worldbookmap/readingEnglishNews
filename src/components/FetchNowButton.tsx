"use client";

import { useState, useTransition } from "react";
import { fetchNow } from "@/app/actions";

export function FetchNowButton() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      {message && <span className="text-sm text-muted">{message}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(null);
            try {
              const r = await fetchNow();
              setMessage(r.saved ? `새 기사 ${r.saved}개를 저장했어요` : "새로 저장할 기사가 없어요");
            } catch {
              setMessage("불러오지 못했어요");
            }
          })
        }
        className="rounded-full border border-line bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-ink/40 disabled:opacity-60"
      >
        {pending ? "불러오는 중…" : "지금 불러오기"}
      </button>
    </div>
  );
}
