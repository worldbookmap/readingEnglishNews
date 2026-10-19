"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { addBook } from "@/app/actions";
import { readBookFile } from "@/lib/bookFile";

// Type or paste a book, or load a .txt/.epub/.pdf file into the text box (EPUB and PDF
// are converted to text in the browser). The text is split into pages on the server.
export function AddBookForm() {
  const [state, action] = useActionState(addBook, { error: null });
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const loadFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ""; // so the same file can be picked again
    if (!file) return;
    setFileError(null);
    setLoading(file.name);
    try {
      const book = await readBookFile(file);
      setText(book.text);
      setTitle(book.title ?? file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
      if (book.author) setAuthor(book.author);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "파일을 읽지 못했어요");
    } finally {
      setLoading(null);
    }
  };

  const input = "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink/40";
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" className={input} />
        <input name="author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="지은이 (선택)" className={input} />
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
          {loading ? `${loading} 변환하는 중…` : "파일 불러오기 (.txt, .epub, .pdf)"}
          <input
            type="file"
            accept=".txt,.epub,.pdf,text/plain,application/epub+zip,application/pdf"
            disabled={!!loading}
            className="sr-only"
            onChange={(e) => loadFile(e.currentTarget)}
          />
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{fileError ?? state.error ?? (words ? `${words.toLocaleString()} words` : "")}</span>
          <SubmitButton disabled={words < 30 || !title.trim() || !!loading} />
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
