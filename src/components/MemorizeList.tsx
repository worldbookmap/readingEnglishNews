"use client";

import { useState } from "react";
import { STUDY_SOURCES, type StudySource } from "@/lib/studySources";

export interface MemoEntry {
  key: string;
  word: string;
  meaning: string | null;
  source: "article" | StudySource;
  createdAt: string;
}

type Filter = "all" | MemoEntry["source"];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "article", label: "기사에서 저장" },
  ...(Object.entries(STUDY_SOURCES) as [StudySource, string][]).map(([id, label]) => ({ id, label })),
];

export function MemorizeList({ entries }: { entries: MemoEntry[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const visible = filter === "all" ? entries : entries.filter((e) => e.source === filter);

  const toggle = (key: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (!entries.length) {
    return (
      <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
        아직 단어가 없어요. 기사에서 단어를 저장하거나 &ldquo;새로 불러오기&rdquo;를 눌러보세요.
      </p>
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
              filter === f.id ? "bg-ink text-paper" : "border border-line bg-card text-muted hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setShowAll((v) => !v);
            setRevealed(new Set());
          }}
          className="ml-auto rounded-full border border-line bg-card px-3 py-1.5 text-sm hover:border-ink/40"
        >
          {showAll ? "뜻 모두 가리기" : "뜻 모두 보기"}
        </button>
      </div>

      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {visible.map((e) => {
          const shown = showAll !== revealed.has(e.key);
          return (
            <li key={e.key}>
              <button
                type="button"
                onClick={() => toggle(e.key)}
                aria-expanded={shown}
                className="flex w-full items-baseline gap-2 px-4 py-3 text-left hover:bg-paper"
              >
                <span className="shrink-0 font-serif text-lg font-semibold">{e.word}:</span>
                {/* Hidden meanings stay faintly visible so a glance can confirm a guess. */}
                <span
                  className={`whitespace-pre-line text-sm transition-opacity duration-200 ${
                    shown ? "text-ink/80" : "select-none text-ink opacity-10"
                  }`}
                >
                  {e.meaning ?? "(뜻 없음)"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
