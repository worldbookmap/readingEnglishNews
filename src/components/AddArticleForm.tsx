"use client";

import { useFormStatus } from "react-dom";
import { addArticle } from "@/app/actions";

// Save one article by URL; the server action opens it right away.
export function AddArticleForm({ error }: { error: boolean }) {
  return (
    <form action={addArticle} className="mb-10">
      <div className="flex gap-2">
        <input
          name="url"
          type="url"
          required
          placeholder="읽고 싶은 기사 URL을 붙여넣으세요"
          className="min-w-0 flex-1 rounded-full border border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink/40"
        />
        <SubmitButton />
      </div>
      {error && <p className="mt-2 px-4 text-sm text-accent">올바른 URL이 아니에요.</p>}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "불러오는 중…" : "기사 추가"}
    </button>
  );
}
