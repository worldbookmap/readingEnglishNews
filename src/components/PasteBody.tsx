"use client";

import { useState, useTransition } from "react";
import { setArticleBody } from "@/app/actions";

// Shown for articles whose body the server can't fetch (NYT Modern Love, or an added
// article from a site that blocks it).
export function PasteBody({ articleId, url, excerpt }: { articleId: string; url: string; excerpt: string | null }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-5">
      {excerpt && <p className="font-serif text-lg leading-relaxed text-ink/80">{excerpt}</p>}

      <div className="rounded-2xl border border-line bg-card p-5">
        <h2 className="font-semibold">본문 붙여넣기</h2>
        <p className="mt-1 text-sm text-muted">
          이 사이트는 외부에서 본문을 가져올 수 없어요.{" "}
          <a href={url} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-4">
            원문
          </a>
          에서 본문 부분을 드래그해 복사한 뒤 아래에 붙여넣으면, 다른 기사처럼 단어와 문장을 저장하며 읽을 수 있어요.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="여기에 본문을 붙여넣으세요"
          className="mt-4 w-full rounded-lg border border-line bg-paper p-3 font-serif text-sm leading-relaxed outline-none focus:border-ink/40"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm text-muted">{error ?? (words ? `${words.toLocaleString()} words` : "")}</span>
          <button
            type="button"
            disabled={pending || words < 30}
            onClick={() =>
              start(async () => {
                setError(null);
                try {
                  await setArticleBody(articleId, text);
                } catch {
                  setError("저장하지 못했어요. 다시 시도해주세요");
                }
              })
            }
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "저장 중…" : "본문 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
