"use client";

import { useEffect, useRef, useState } from "react";
import { THEME_COOKIE } from "@/lib/theme";
import { PaletteIcon } from "./icons";

// The whole page's background color, kept per device. Each theme is a palette in globals.css
// selected by data-theme on <html>; "" follows the OS. It's a cookie so the root layout can
// render the attribute itself: set from a script, React drops it when hydration recovers
// (dictionary extensions that inject into the page cause that on every load).

const THEMES = [
  { id: "", label: "자동" },
  { id: "white", label: "흰색" },
  { id: "cream", label: "크림" },
  { id: "sepia", label: "세피아" },
  { id: "sage", label: "연두" },
  { id: "sky", label: "하늘" },
  { id: "night", label: "어둡게" },
  { id: "black", label: "검정" },
];

function applyTheme(id: string) {
  if (id) document.documentElement.dataset.theme = id;
  else delete document.documentElement.dataset.theme;
  document.cookie = `${THEME_COOKIE}=${id}; path=/; samesite=lax; max-age=${id ? 60 * 60 * 24 * 400 : 0}`;
}

// A swatch sets data-theme on itself, so it shows that palette whatever the page is using.
function Swatch({ id }: { id: string }) {
  const box = "flex h-10 items-center justify-center bg-paper font-serif text-sm text-ink";
  if (id) {
    return (
      <span data-theme={id} className={`${box} w-full rounded-lg border border-line`}>
        Aa
      </span>
    );
  }
  return (
    <span className="flex w-full overflow-hidden rounded-lg border border-line">
      <span data-theme="cream" className={`${box} flex-1`}>
        A
      </span>
      <span data-theme="night" className={`${box} flex-1`}>
        a
      </span>
    </span>
  );
}

export function ThemePicker() {
  const [theme, setTheme] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (id: string) => {
    setTheme(id);
    applyTheme(id);
  };

  return (
    <div ref={root} className="shrink-0">
      <button
        type="button"
        onClick={() => {
          setTheme(document.documentElement.dataset.theme ?? "");
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-label="바탕색 선택"
        title="바탕색 선택"
        className="rounded-full p-2 text-muted transition-colors hover:text-ink"
      >
        <PaletteIcon />
      </button>
      {open && (
        <div className="absolute right-2 top-full z-40 mt-1 grid w-64 grid-cols-4 gap-2 rounded-2xl border border-line bg-card p-3 shadow-lg sm:right-4">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => choose(t.id)}
              aria-pressed={theme === t.id}
              className={`flex flex-col items-center gap-1 rounded-xl p-1 text-xs ring-2 transition-colors ${
                theme === t.id ? "text-ink ring-accent" : "text-muted ring-transparent hover:text-ink"
              }`}
            >
              <Swatch id={t.id} />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
