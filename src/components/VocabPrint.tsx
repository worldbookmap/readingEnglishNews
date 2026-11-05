"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { SavedSentenceRow, SavedWordRow } from "@/lib/supabase";
import { PrinterIcon } from "./icons";
import { highlight } from "./WordList";

interface Props {
  title: string;
  words: SavedWordRow[];
  sentences: SavedSentenceRow[];
}

const bySaved = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at);

// The sheet exists only while printing, so printing the page any other way still prints the article.
export function VocabPrintButton({ title, words, sentences }: Props) {
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return;
    const pageTitle = document.title;
    document.title = `${title} 단어장`; // the default file name when saving as PDF
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    window.print();
    return () => {
      window.removeEventListener("afterprint", done);
      document.title = pageTitle;
    };
  }, [printing, title]);

  return (
    <>
      <button
        type="button"
        onClick={() => setPrinting(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-ink/40 hover:text-ink"
      >
        <PrinterIcon width={14} height={14} />
        단어장 인쇄
      </button>
      {printing && createPortal(<VocabSheet title={title} words={words} sentences={sentences} />, document.body)}
    </>
  );
}

function VocabSheet({ title, words, sentences }: Props) {
  return (
    <div className="vocab-sheet text-ink">
      <header className="mb-6 border-b-2 border-ink pb-3">
        <p className="text-xs text-muted">단어장</p>
        <h1 className="mt-1 font-serif text-2xl leading-tight font-semibold wrap-anywhere">{title}</h1>
        <p className="mt-1 text-xs text-muted">
          {[words.length > 0 && `단어 ${words.length}개`, sentences.length > 0 && `문장 ${sentences.length}개`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      {words.length > 0 && (
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-ink text-xs text-muted">
              <th className="w-8 py-1.5 font-medium">#</th>
              <th className="w-[30%] py-1.5 pr-4 font-medium">단어</th>
              <th className="py-1.5 font-medium">뜻 · 예문</th>
            </tr>
          </thead>
          <tbody>
            {[...words].sort(bySaved).map((w, i) => (
              <tr key={w.id} className="break-inside-avoid border-b border-line align-top">
                <td className="py-2 text-xs text-muted">{i + 1}</td>
                <td className="py-2 pr-4">
                  <p className="font-serif text-base font-semibold wrap-anywhere">{w.word}</p>
                  {w.phonetic && <p className="text-xs text-muted">{w.phonetic}</p>}
                </td>
                <td className="py-2">
                  {w.definition && <p className="whitespace-pre-line">{w.definition}</p>}
                  {w.context && <p className="mt-1 font-serif text-muted italic">{highlight(w.context, w.word)}</p>}
                  {w.note && <p className="mt-1 border-l-2 border-ink pl-2">{w.note}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {sentences.length > 0 && (
        <section className={words.length > 0 ? "mt-8" : undefined}>
          <h2 className="border-b border-ink py-1.5 text-xs font-medium text-muted">문장</h2>
          <ol>
            {[...sentences].sort(bySaved).map((s) => (
              <li key={s.id} className="break-inside-avoid border-b border-line py-2 text-sm">
                <p className="font-serif leading-relaxed">{s.text}</p>
                {s.note && <p className="mt-1 border-l-2 border-ink pl-2">{s.note}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
