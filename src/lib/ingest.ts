import "server-only";
import { extractArticle } from "./extract";
import { fetchHtml, popularFor, SOURCES, type PopularItem, type SourceId } from "./sources";
import { db } from "./supabase";

const TIME_ZONE = "Asia/Seoul";

// "Yesterday" as a YYYY-MM-DD date in the reader's time zone.
export function yesterday(now = new Date()): string {
  const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d);
}

export interface IngestResult {
  popularOn: string;
  saved: { source: SourceId; rank: number; url: string; title: string }[];
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

  await Promise.all(
    items.map(async (item) => {
      if (known.has(item.url)) {
        result.skipped.push({ url: item.url, reason: "already saved" });
        return;
      }
      try {
        const row = item.bodyFetchable ? await fetchedRow(item) : feedOnlyRow(item);
        const { error } = await db()
          .from("articles")
          .insert({ ...row, source: item.source, url: item.url, popular_on: popularOn, popular_rank: item.rank });
        if (error) throw error;
        result.saved.push({ source: item.source, rank: item.rank, url: item.url, title: row.title });
      } catch (e) {
        result.skipped.push({ url: item.url, reason: e instanceof Error ? e.message : String(e) });
      }
    }),
  );
  return result;
}

async function fetchedRow(item: PopularItem) {
  const a = extractArticle(await fetchHtml(item.url), item.url);
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
function feedOnlyRow(item: PopularItem) {
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
