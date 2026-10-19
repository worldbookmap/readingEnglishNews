"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "오늘의 기사" },
  { href: "/books", label: "책" },
  { href: "/history", label: "읽은 글" },
  { href: "/words", label: "단어·문장" },
  { href: "/memorize", label: "암기장" },
  { href: "/search", label: "검색" },
];

export function Nav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-3 sm:px-6">
        <Link href="/" className="mr-1 shrink-0 font-serif text-lg sm:mr-3 font-semibold tracking-tight">
          Reading<span className="text-accent">.</span>
        </Link>
        {LINKS.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`shrink-0 rounded-full px-2 py-1.5 text-sm sm:px-3 transition-colors ${
                active ? "bg-ink text-paper" : "text-muted hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
