"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { removeSentence, updateSentenceNote } from "@/app/actions";
import { SOURCE_LABELS, type SourceId } from "@/lib/sources";
import type { SavedSentenceRow } from "@/lib/supabase";
import { formatDate } from "./ArticleCard";

export type SentenceWithArticle = SavedSentenceRow & { article: { id: string; title: string; source: SourceId } };

export function SentenceList({ sentences }: { sentences: SentenceWithArticle[] }) {
  if (!sentences.length) {
    return (
      <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
        아직 저장한 문장이 없어요. 기사에서 단어를 누른 뒤 &lsquo;이 문장 저장&rsquo;을 누르거나, 문장을 드래그해서 저장해보세요.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {sentences.map((s) => (
        <SentenceCard key={s.id} sentence={s} />
      ))}
    </ul>
  );
}

function SentenceCard({ sentence: s }: { sentence: SentenceWithArticle }) {
  const [note, setNote] = useState(s.note ?? "");
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  return (
    <li className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <p className="font-serif text-lg leading-relaxed">{s.text}</p>

      {editing ? (
        <div className="mt-3 flex gap-2">
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") start(async () => {
                await updateSentenceNote(s.id, note);
                setEditing(false);
              });
            }}
            placeholder="해석이나 메모를 적어두세요"
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink/40"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await updateSentenceNote(s.id, note);
                setEditing(false);
              })
            }
            className="rounded-lg bg-ink px-3 py-2 text-sm text-paper disabled:opacity-50"
          >
            저장
          </button>
        </div>
      ) : (
        s.note && <p className="mt-2 border-l-2 border-accent pl-3 text-sm text-ink/80">{s.note}</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
        <Link href={`/articles/${s.article.id}`} className="min-w-0 truncate hover:text-ink hover:underline">
          {SOURCE_LABELS[s.article.source]} · {s.article.title}
        </Link>
        <span className="flex shrink-0 items-center gap-3">
          {formatDate(s.created_at)}
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="hover:text-ink">
              {s.note ? "메모 수정" : "메모"}
            </button>
          )}
          <button type="button" disabled={pending} onClick={() => start(() => removeSentence(s.id))} className="hover:text-accent">
            삭제
          </button>
        </span>
      </div>
    </li>
  );
}
