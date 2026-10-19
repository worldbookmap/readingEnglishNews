"use client";

import { useState, useTransition } from "react";
import { importBook } from "@/app/actions";

// Imports a Project Gutenberg book; the server action opens it when done.
export function ImportBookButton({ gutenbergId, imported }: { gutenbergId: number; imported: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await importBook(gutenbergId);
            if (res?.error) setError(res.error);
          })
        }
        className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-opacity disabled:opacity-60 ${
          imported ? "border border-line bg-card text-ink hover:border-ink/40" : "bg-ink text-paper hover:opacity-90"
        }`}
      >
        {pending ? "가져오는 중…" : imported ? "열기" : "가져오기"}
      </button>
      {error && <p className="text-right text-xs text-accent">{error}</p>}
    </div>
  );
}
