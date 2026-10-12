"use client";

import { useTransition } from "react";
import { deleteArticle } from "@/app/actions";
import { TrashIcon } from "./icons";

export function DeleteArticleButton({ articleId, savedCount }: { articleId: string; savedCount: number }) {
  const [pending, start] = useTransition();

  const remove = () => {
    const message =
      savedCount > 0
        ? `이 기사를 삭제할까요?\n이 기사에서 저장한 단어·문장 ${savedCount}개도 함께 삭제돼요.`
        : "이 기사를 삭제할까요?";
    if (!confirm(message)) return;
    start(() => deleteArticle(articleId));
  };

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      aria-label="기사 삭제"
      title="기사 삭제"
      className="shrink-0 rounded-full border border-line bg-card p-2 text-muted transition-colors hover:border-red-400 hover:text-red-600 disabled:opacity-70"
    >
      <TrashIcon />
    </button>
  );
}
