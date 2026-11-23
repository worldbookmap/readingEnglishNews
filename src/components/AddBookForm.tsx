"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { addBook, addBookImage } from "@/app/actions";
import { EPUB_IMAGE, prepareImage, readBookFile, type BookFile } from "@/lib/bookFile";
import type { Block } from "@/lib/extract";

// Type or paste a book, or load a .txt/.epub/.pdf file into the text box (EPUB and PDF
// are converted to text in the browser). The text is split into pages on the server.
// An EPUB keeps its bold/italic and images unless the text is edited: its images are
// uploaded one by one, then its blocks are saved instead of the text.
export function AddBookForm() {
  const [state, action, pending] = useActionState(addBook, { error: null });
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [epub, setEpub] = useState<Pick<BookFile, "blocks" | "images"> | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const imageCount = epub?.blocks?.filter((b) => b.type === "img").length ?? 0;
  const styled = epub?.blocks?.some((b) => b.type !== "img" && b.marks?.length);

  const loadFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ""; // so the same file can be picked again
    if (!file) return;
    setFileError(null);
    setLoading(file.name);
    try {
      const book = await readBookFile(file);
      setText(book.text);
      setEpub(book.blocks ? { blocks: book.blocks, images: book.images } : null);
      setTitle(book.title ?? file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
      if (book.author) setAuthor(book.author);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "파일을 읽지 못했어요");
    } finally {
      setLoading(null);
    }
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    if (!epub?.blocks) return; // plain text: the form's action sends it
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.delete("text");
    setFileError(null);
    try {
      const key = crypto.randomUUID();
      const blocks = await uploadImages(epub.blocks, epub.images ?? new Map(), key, (done, total) =>
        setUploading(`그림 올리는 중 ${done}/${total}`),
      );
      formData.set("key", key);
      formData.set("blocks", JSON.stringify(blocks));
      startTransition(() => action(formData));
    } catch {
      setFileError("그림을 올리지 못했어요. 다시 시도해주세요");
    } finally {
      setUploading(null);
    }
  };

  const input = "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink/40";
  return (
    <form action={action} onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" className={input} />
        <input name="author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="지은이 (선택)" className={input} />
      </div>
      <textarea
        name="text"
        required
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setEpub(null); // edited: saved as plain text
        }}
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
          <span className="text-sm text-muted">
            {uploading ??
              fileError ??
              state.error ??
              [words ? `${words.toLocaleString()} words` : "", imageCount ? `그림 ${imageCount}개` : "", styled ? "서식 포함" : ""]
                .filter(Boolean)
                .join(" · ")}
          </span>
          <SubmitButton busy={pending || !!uploading} disabled={words < 30 || !title.trim() || !!loading} />
        </div>
      </div>
    </form>
  );
}

// Uploads each distinct image (a few at a time) and points its blocks at the uploaded
// file; images that can't be decoded are dropped.
async function uploadImages(
  blocks: Block[],
  images: Map<string, Blob>,
  key: string,
  progress: (done: number, total: number) => void,
): Promise<Block[]> {
  const paths = [...new Set(blocks.flatMap((b) => (b.type === "img" && b.src.startsWith(EPUB_IMAGE) ? [b.src] : [])))];
  const uploaded = new Map<string, { src: string; width: number; height: number }>();
  let next = 0;
  let done = 0;
  progress(0, paths.length);
  const worker = async () => {
    while (next < paths.length) {
      const n = next++;
      const blob = images.get(paths[n].slice(EPUB_IMAGE.length));
      const image = blob && (await prepareImage(blob));
      if (image) {
        const formData = new FormData();
        formData.set("key", key);
        formData.set("name", String(n + 1));
        formData.set("file", image.blob);
        uploaded.set(paths[n], { src: await addBookImage(formData), width: image.width, height: image.height });
      }
      progress(++done, paths.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, paths.length) }, worker));
  return blocks.flatMap((b): Block[] => {
    if (b.type !== "img") return [b];
    const image = uploaded.get(b.src);
    return image ? [{ ...b, ...image }] : [];
  });
}

function SubmitButton({ busy, disabled }: { busy: boolean; disabled: boolean }) {
  const { pending: submitting } = useFormStatus();
  const pending = busy || submitting;
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
