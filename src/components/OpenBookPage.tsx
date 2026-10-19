"use client";

import { useEffect, useRef } from "react";
import { openBookPage } from "@/app/actions";

// Records 클릭함 and the page to resume from, once per page visit.
export function OpenBookPage({ articleId, page }: { articleId: string; page: number }) {
  const marked = useRef<number | null>(null);
  useEffect(() => {
    if (marked.current === page) return;
    marked.current = page;
    openBookPage(articleId, page).catch(() => {});
  }, [articleId, page]);
  return null;
}
