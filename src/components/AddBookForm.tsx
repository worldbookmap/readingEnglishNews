"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { addBook } from "@/app/actions";

// Type or paste a book, or load a .txt file into the text box. The text is split into
// pages on the server.
export function AddBookForm() {
  const [state, action] = useActionState(addBook, { error: null });
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    if (!title) setTitle(file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
  };

  const input = "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink/40";
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" className={input} />
        <input name="author" placeholder="지은이 (선택)" className={input} />
      </div>
      <textarea
        name="text"
        required
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder="책 내용을 붙여넣으세요. 길면 자동으로 여러 페이지로 나눠져요."
        className={`${input} font-serif leading-relaxed`}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="cursor-pointer text-sm text-muted underline underline-offset-4 hover:text-ink">
          .txt 파일 불러오기
          <input type="file" accept=".txt,text/plain" className="sr-only" onChange={(e) => loadFile(e.target.files?.[0])} />
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{state.error ?? (words ? `${words.toLocaleString()} words` : "")}</span>
          <SubmitButton disabled={words < 30 || !title.trim()} />
        </div>
      </div>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="shrink-0 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "저장 중…" : "책 저장"}
    </button>
  );
}
