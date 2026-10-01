"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { removeWord } from "@/app/actions";
import { naverDictUrl } from "@/lib/dictionary";
import { SOURCE_LABELS, type SourceId } from "@/lib/sources";
import type { SavedWordRow } from "@/lib/supabase";
import { formatDate } from "./ArticleCard";

export type WordWithArticle = SavedWordRow & { article: { id: string; title: string; source: SourceId } };

type Sort = "recent" | "alpha";

// The same word can be saved from several articles; show it once with every source.
interface Entry {
  word: string;
  phonetic: string | null;
  definition: string | null;
  latest: string;
  occurrences: WordWithArticle[];
}

export function WordList({ words }: { words: WordWithArticle[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [hideDefs, setHideDefs] = useState(false);

  const entries = useMemo(() => {
    const map = new Map<string, Entry>();
    for (const w of words) {
      const e = map.get(w.word);
      if (e) {
        e.occurrences.push(w);
        e.definition ??= w.definition;
        e.phonetic ??= w.phonetic;
      } else {
        map.set(w.word, { word: w.word, phonetic: w.phonetic, definition: w.definition, latest: w.created_at, occurrences: [w] });
      }
    }
    const q = query.trim().toLowerCase();
    const list = [...map.values()].filter(
      (e) => !q || e.word.includes(q) || e.occurrences.some((o) => o.article.title.toLowerCase().includes(q)),
    );
    return sort === "alpha" ? list.sort((a, b) => a.word.localeCompare(b.word)) : list;
  }, [words, query, sort]);

  if (!words.length) {
    return (
      <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
        아직 저장한 단어가 없어요. 기사를 읽다가 모르는 단어를 눌러보세요.
      </p>
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="단어나 기사 제목 검색"
          className="min-w-0 flex-1 rounded-full border border-line bg-card px-4 py-2 text-sm outline-none focus:border-ink/40"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-full border border-line bg-card px-3 py-2 text-sm"
        >
          <option value="recent">최근 저장순</option>
          <option value="alpha">알파벳순</option>
        </select>
        <label className="flex items-center gap-2 rounded-full border border-line bg-card px-3 py-2 text-sm">
          <input type="checkbox" checked={hideDefs} onChange={(e) => setHideDefs(e.target.checked)} />뜻 가리기
        </label>
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {entries.map((e) => (
          <WordCard key={e.word} entry={e} hideDef={hideDefs} />
        ))}
      </ul>
    </>
  );
}

function WordCard({ entry, hideDef }: { entry: Entry; hideDef: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const [pending, start] = useTransition();
  const showDef = !hideDef || revealed;

  return (
    <li className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-xl font-semibold">{entry.word}</span>
          {entry.phonetic && <span className="text-xs text-muted">{entry.phonetic}</span>}
        </div>
        <a href={naverDictUrl(entry.word)} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-muted hover:text-ink">
          네이버 사전 ↗
        </a>
      </div>

      {entry.definition &&
        (showDef ? (
          <p className="mt-1 whitespace-pre-line text-sm text-ink/80">{entry.definition}</p>
        ) : (
          <button type="button" onClick={() => setRevealed(true)} className="mt-1 text-sm text-accent">
            뜻 보기
          </button>
        ))}

      <ul className="mt-3 space-y-2">
        {entry.occurrences.map((o) => (
          <li key={o.id} className="rounded-lg bg-paper px-3 py-2">
            {o.context && <p className="font-serif text-sm leading-relaxed">{highlight(o.context, entry.word)}</p>}
            <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
              <Link href={`/articles/${o.article.id}`} className="min-w-0 truncate hover:text-ink hover:underline">
                {SOURCE_LABELS[o.article.source]} · {o.article.title}
              </Link>
              <span className="flex shrink-0 items-center gap-2">
                {formatDate(o.created_at)}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(() => removeWord(o.id))}
                  className="hover:text-accent"
                  aria-label="삭제"
                >
                  삭제
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </li>
  );
}

function highlight(sentence: string, word: string) {
  const re = new RegExp(`(\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*)`, "i");
  return sentence.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-word-mark px-0.5 text-ink">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
