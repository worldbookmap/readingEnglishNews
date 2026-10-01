"use client";

import { useEffect, useRef } from "react";
import { markOpened } from "@/app/actions";

// Records "클릭함" once per visit (StrictMode runs effects twice in dev).
export function MarkOpened({ articleId }: { articleId: string }) {
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    markOpened(articleId).catch(() => {});
  }, [articleId]);
  return null;
}
