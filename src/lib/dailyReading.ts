import "server-only";
import type { Block } from "./extract";
import { fillMissingAudio } from "./ingest";
import { db, type BookPageRow } from "./supabase";

// What opens over the home page: today's Daily Stoic meditation, then the newest BBC
// Learning English programme.
//
// The Daily Stoic has one meditation per day of the year, each starting with a heading
// like "November 3rd ACCEPTING WHAT IS" (date + title). Today's is found in the saved
// book's pages.

const BOOK_TITLE = "%daily stoic%";
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const DAY = new RegExp(`^(${MONTHS}) \\d{1,2}(st|nd|rd|th)\\b`);
const MONTH_TITLE = new RegExp(`^(${MONTHS})$`, "i");
// "— EPICTETUS, DISCOURSES , 1.24.1–2" (the dash is sometimes missing)
const SOURCE = /^[—–]|^\P{Ll}+\d( ?[a-z])?$/u;

export interface DailyReading {
  bookId: string;
  page: number;
  block: number;
  date: string; // "November 3rd"
  title: string;
  // The quotes and their sources, then the meditation.
  blocks: { kind: "quote" | "source" | "p"; text: string }[];
}

// Today in Korea, as the book writes it: "November 3rd".
function todayLabel() {
  const parts = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).formatToParts(new Date());
  const month = parts.find((p) => p.type === "month")!.value;
  const day = Number(parts.find((p) => p.type === "day")!.value);
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${month} ${day}${suffix}`;
}

export async function todaysReading(): Promise<DailyReading | null> {
  const book = await db().from("articles").select("id").eq("source", "book").ilike("title", BOOK_TITLE).limit(1).maybeSingle();
  if (book.error) throw book.error;
  if (!book.data) return null;
  const bookId = book.data.id as string;

  const date = todayLabel();
  const hits = await db().rpc("search_content", { q: date });
  if (hits.error) throw hits.error;
  const hit = ((hits.data ?? []) as { article_id: string; page: number | null; block: number; text: string }[]).find(
    (h) => h.article_id === bookId && h.page !== null && (h.text === date || h.text.startsWith(`${date} `)),
  );
  if (!hit) return null;

  // A meditation can run onto the next page.
  const pages = await db().from("book_pages").select("*").eq("article_id", bookId).in("page", [hit.page!, hit.page! + 1]).order("page");
  if (pages.error) throw pages.error;
  const all = ((pages.data ?? []) as BookPageRow[]).flatMap((p) => p.blocks);
  const entry = readEntry(all, hit.block, date);
  return entry && { bookId, page: hit.page!, block: hit.block, date, ...entry };
}

// The day's entry from the blocks of its page (and the next one), given where it starts.
export function readEntry(all: Block[], start: number, date: string): Pick<DailyReading, "title" | "blocks"> | null {
  // Usually a heading, but a title ending in "?" is imported as a paragraph.
  const heading = all[start];
  if (!heading || heading.type === "img") return null;

  // The quotes, their sources ("— SENECA, …") and the meditation run up to the next day
  // or the next month's title page ("MARCH" / "AWARENESS"). After December 31st, the
  // afterword starts at an all-caps heading.
  const rest = all.slice(start + 1).filter((b) => b.type !== "img");
  let end = rest.findIndex((b) => DAY.test(b.text) || (b.type === "h" && MONTH_TITLE.test(b.text)));
  if (end < 0) end = rest.findIndex((b) => b.type === "h" && !SOURCE.test(b.text) && !/\p{Ll}/u.test(b.text));
  const entry = (end < 0 ? rest : rest.slice(0, end)).map((b) => b.text);
  const lastSource = entry.findLastIndex((t) => SOURCE.test(t));
  const blocks = entry.map((text, i) => ({
    kind: i > lastSource ? ("p" as const) : SOURCE.test(text) ? ("source" as const) : ("quote" as const),
    text,
  }));
  return { title: heading.text.slice(date.length).trim(), blocks };
}

// The newest BBC Learning English programme, shown after the meditation.
export interface DailyProgramme {
  id: string;
  url: string;
  series: string | null; // "6 Minute English"
  title: string;
  imageUrl: string | null;
  audioUrl: string; // "" = none
  blocks: Block[];
}

export async function latestProgramme(): Promise<DailyProgramme | null> {
  const { data, error } = await db()
    .from("articles")
    .select("id, url, byline, title, image_url, audio_url, blocks")
    .eq("source", "bbc")
    .order("popular_on", { ascending: false })
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    url: data.url,
    series: data.byline,
    title: data.title,
    imageUrl: data.image_url,
    audioUrl: await fillMissingAudio(data),
    blocks: data.blocks as Block[],
  };
}
