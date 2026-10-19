"use client";

import { useTransition } from "react";
import { deleteArticle } from "@/app/actions";
import { TrashIcon } from "./icons";

export function DeleteArticleButton({
  articleId,
  savedCount,
  noun = "기사",
}: {
  articleId: string;
  savedCount: number;
  noun?: "기사" | "책";
}) {
  const [pending, start] = useTransition();

  const remove = () => {
    const message =
      savedCount > 0
        ? `이 ${noun}을(를) 삭제할까요?\n이 ${noun}에서 저장한 단어·문장 ${savedCount}개도 함께 삭제돼요.`
        : `이 ${noun}을(를) 삭제할까요?`;
    if (!confirm(message)) return;
    start(() => deleteArticle(articleId));
  };

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      aria-label={`${noun} 삭제`}
      title={`${noun} 삭제`}
      className="shrink-0 rounded-full border border-line bg-card p-2 text-muted transition-colors hover:border-red-400 hover:text-red-600 disabled:opacity-70"
    >
      <TrashIcon />
    </button>
  );
}
