"use client";

import { useEffect } from "react";

// Space taken by the sticky nav (same as ReadingPosition).
const TOP_OFFSET = 80;

// Opened from a search result: scrolls to the paragraph and marks the search term in
// the text (CSS Custom Highlight API, so the reader's own markup is left alone).
export function JumpToBlock({ block, q }: { block: number; q: string }) {
  useEffect(() => {
    const t = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`.reader [data-block="${block}"]`);
      if (!el) return;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - TOP_OFFSET * 2 });
      el.classList.add("search-target");
      if (q && "highlights" in CSS) {
        const needle = q.toLowerCase();
        const ranges: Range[] = [];
        for (const p of document.querySelectorAll(".reader [data-block]")) {
          // The reader splits text into one span per word, so match on the paragraph's
          // text and map offsets back to its text nodes.
          const nodes: Text[] = [];
          const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) nodes.push(walker.currentNode as Text);
          const full = nodes.map((n) => n.data).join("");
          const lower = full.toLowerCase();
          const locate = (offset: number): [Text, number] => {
            for (const n of nodes) {
              if (offset <= n.data.length) return [n, offset];
              offset -= n.data.length;
            }
            return [nodes.at(-1)!, nodes.at(-1)!.data.length];
          };
          for (let i = lower.indexOf(needle); i >= 0; i = lower.indexOf(needle, i + needle.length)) {
            const r = new Range();
            r.setStart(...locate(i));
            r.setEnd(...locate(i + needle.length));
            ranges.push(r);
          }
        }
        CSS.highlights.set("search", new Highlight(...ranges));
      }
    }, 50);
    return () => {
      window.clearTimeout(t);
      if ("highlights" in CSS) CSS.highlights.delete("search");
      document.querySelector(".search-target")?.classList.remove("search-target");
    };
  }, [block, q]);
  return null;
}
