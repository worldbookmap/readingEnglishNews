import "server-only";
import { extractArticle } from "./extract";
import { fetchHtml, popularFor, SOURCES, type FeedSourceId, type PopularItem } from "./sources";
import { db } from "./supabase";

const TIME_ZONE = "Asia/Seoul";

// "Yesterday" as a YYYY-MM-DD date in the reader's time zone.
export function yesterday(now = new Date()): string {
  const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d);
}

const today = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);

export interface IngestResult {
  popularOn: string;
  saved: { source: FeedSourceId; rank: number; url: string; title: string }[];
  skipped: { url: string; reason: string }[];
}

export async function ingestPopular(perSource = Number(process.env.ARTICLES_PER_SOURCE ?? 5)): Promise<IngestResult> {
  const popularOn = yesterday();
  const result: IngestResult = { popularOn, saved: [], skipped: [] };
  const sources = SOURCES;

  const lists = await Promise.allSettled(sources.map((s) => popularFor(s, perSource)));
  const items = lists.flatMap((r, i) => {
    if (r.status === "fulfilled") return r.value;
    result.skipped.push({ url: sources[i], reason: String(r.reason) });
    return [];
  });

  // Articles that were already stored keep their original row (and reading history).
  const { data: existing, error } = await db()
    .from("articles")
    .select("url")
    .in("url", items.map((i) => i.url));
  if (error) throw error;
  const known = new Set((existing ?? []).map((r) => r.url as string));

  const fetched = await Promise.all(
    items.map(async (item) => {
      if (known.has(item.url)) {
        result.skipped.push({ url: item.url, reason: "already saved" });
        return null;
      }
      try {
        return { item, row: item.bodyFetchable ? await fetchedRow(item.url) : feedOnlyRow(item) };
      } catch (e) {
        result.skipped.push({ url: item.url, reason: e instanceof Error ? e.message : String(e) });
        return null;
      }
    }),
  );

  // A second fetch on the same day continues numbering after the articles already
  // saved for that day, so ranks within (popular_on, source) never collide.
  const { data: sameDay, error: rankError } = await db()
    .from("articles")
    .select("source, popular_rank")
    .eq("popular_on", popularOn);
  if (rankError) throw rankError;
  const nextRank = new Map<string, number>();
  for (const r of sameDay ?? []) {
    nextRank.set(r.source, Math.max(nextRank.get(r.source) ?? 0, r.popular_rank as number));
  }

  const toSave = fetched
    .filter((f) => f !== null)
    .sort((a, b) => a.item.source.localeCompare(b.item.source) || a.item.rank - b.item.rank);
  for (const { item, row } of toSave) {
    const rank = (nextRank.get(item.source) ?? 0) + 1;
    const { error } = await db()
      .from("articles")
      .insert({ ...row, source: item.source, url: item.url, popular_on: popularOn, popular_rank: rank });
    if (error) {
      result.skipped.push({ url: item.url, reason: error.message });
      continue;
    }
    nextRank.set(item.source, rank);
    result.saved.push({ source: item.source, rank, url: item.url, title: row.title });
  }
  return result;
}

// An article the reader added by URL. Returns the article id (the existing one if the
// URL was already saved). When the body can't be fetched, it's saved without one and
// the reader pastes it in, like NYT Modern Love.
export async function ingestUrl(url: string): Promise<string> {
  const { data: existing, error } = await db().from("articles").select("id").eq("url", url).maybeSingle();
  if (error) throw error;
  if (existing) return existing.id as string;

  let row;
  try {
    row = await fetchedRow(url);
  } catch {
    row = feedOnlyRow({ url });
  }

  const addedOn = today();
  const { data: sameDay, error: rankError } = await db()
    .from("articles")
    .select("popular_rank")
    .eq("source", "custom")
    .eq("popular_on", addedOn)
    .order("popular_rank", { ascending: false })
    .limit(1);
  if (rankError) throw rankError;
  const { data, error: insertError } = await db()
    .from("articles")
    .insert({ ...row, source: "custom", url, popular_on: addedOn, popular_rank: (sameDay?.[0]?.popular_rank ?? 0) + 1 })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return data.id as string;
}

async function fetchedRow(url: string) {
  const a = extractArticle(await fetchHtml(url), url);
  if (a.wordCount < 80) throw new Error(`too short (${a.wordCount} words)`);
  return {
    title: a.title,
    byline: a.byline,
    excerpt: a.excerpt,
    image_url: a.imageUrl,
    published_at: a.publishedAt,
    blocks: a.blocks,
    word_count: a.wordCount,
  };
}

// The body is added later by pasting it in the reader (see setArticleBody).
function feedOnlyRow(item: Omit<PopularItem, "source" | "rank" | "bodyFetchable">) {
  return {
    title: item.title ?? item.url,
    byline: item.byline ?? null,
    excerpt: item.excerpt ?? null,
    image_url: item.imageUrl ?? null,
    published_at: item.publishedAt ?? null,
    blocks: [],
    word_count: 0,
  };
}
