"use client";

import { useEffect, useRef, useState } from "react";
import { saveParagraphTranslation } from "@/app/actions";

// 번역하기: a box under a paragraph to write its translation in. Saves a moment after
// typing stops and when leaving the box; ⌘/Ctrl+Enter saves and goes to the next one.
export function TranslationField({ articleId, source, initial, indent }: { articleId: string; source: string; initial: string; indent: boolean }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const saved = useRef(initial);
  const box = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(initial);

  const save = async (text: string) => {
    if (text.trim() === saved.current.trim()) return;
    setStatus("saving");
    try {
      await saveParagraphTranslation(articleId, source, text);
      saved.current = text;
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    latest.current = value;
    if (value.trim() === saved.current.trim()) return;
    const t = setTimeout(() => save(value), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Leaving the page (another page of the book, another mode) right after typing.
  useEffect(
    () => () => {
      if (latest.current.trim() !== saved.current.trim()) saveParagraphTranslation(articleId, source, latest.current).catch(() => {});
    },
    [articleId, source],
  );

  // Grow with the text.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);

  return (
    <div data-mdtr-skip="" className={`-mt-2 mb-6 ${indent ? "ml-5" : ""}`}>
      <textarea
        ref={box}
        data-translation=""
        lang="ko"
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => save(value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
          e.preventDefault();
          save(value);
          const all = [...document.querySelectorAll<HTMLTextAreaElement>("textarea[data-translation]")];
          const next = all[all.indexOf(e.currentTarget) + 1];
          next?.focus();
          next?.scrollIntoView({ block: "center", behavior: "smooth" });
        }}
        placeholder="번역 입력"
        className="block w-full resize-none overflow-hidden rounded-lg border border-line bg-card px-3 py-2 font-sans text-[0.9em] leading-relaxed text-ink outline-none placeholder:text-muted/60 focus:border-accent"
      />
      <p className="mt-1 h-4 text-right font-sans text-[11px] text-muted">
        {status === "saving" ? "저장 중…" : status === "saved" ? "저장됨" : status === "error" ? "저장하지 못했어요 — 다시 시도해주세요" : ""}
      </p>
    </div>
  );
}
