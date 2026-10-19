"use client";

import { useEffect, useRef } from "react";
import { openBookPage } from "@/app/actions";

// Records 클릭함 and the page to resume from, once per page visit. A page opened from a
// search result (`remember` false) doesn't move the bookmark.
export function OpenBookPage({ articleId, page, remember = true }: { articleId: string; page: number; remember?: boolean }) {
  const marked = useRef<number | null>(null);
  useEffect(() => {
    if (marked.current === page) return;
    marked.current = page;
    openBookPage(articleId, page, remember).catch(() => {});
  }, [articleId, page, remember]);
  return null;
}
