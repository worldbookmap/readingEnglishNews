// Finds the "most popular" article URLs for each source.
//
// - BuzzFeed: https://www.buzzfeed.com/trending is server-rendered as a ranked list
//   (cards numbered 1, 2, 3 ... from BuzzFeed's trending feed).
// - The New Yorker / Literary Hub: no public "most popular" list exists, so we use the
//   homepage's editorial order — the top stories the editors are featuring — as the
//   popularity proxy.
// - NYT Modern Love: a weekly column, so "popular" = the newest essays from its RSS
//   feed. nytimes.com blocks server-side article fetches (bot protection + paywall), so
//   only the feed's title/summary is stored; the reader pastes the body in the app.
// - Wait But Why: posts are rare, so the newest post from the RSS feed comes first,
//   followed by the sidebar's "Popular Posts" list (in its order).

export type FeedSourceId = "newyorker" | "buzzfeed" | "modernlove" | "lithub" | "waitbutwhy";
// "custom": an article the reader added by URL (not part of the daily fetch).
export type SourceId = FeedSourceId | "custom";

export const SOURCES: FeedSourceId[] = ["newyorker", "buzzfeed", "modernlove", "lithub", "waitbutwhy"];

export interface PopularItem {
  source: FeedSourceId;
  url: string;
  rank: number;
  // Feed metadata, used when the article body can't be fetched (`bodyFetchable: false`).
  title?: string;
  excerpt?: string | null;
  publishedAt?: string | null;
  imageUrl?: string | null;
  byline?: string | null;
  bodyFetchable: boolean;
}

export const SOURCE_LABELS: Record<SourceId, string> = {
  newyorker: "The New Yorker",
  buzzfeed: "BuzzFeed",
  modernlove: "NYT Modern Love",
  lithub: "Literary Hub",
  waitbutwhy: "Wait But Why",
  custom: "직접 추가",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

function uniqueInOrder(urls: string[]): string[] {
  return [...new Set(urls)];
}

// Sections that are not readable articles (podcasts, cartoons, videos, puzzles...).
const NEW_YORKER_SKIP = /^\/(podcast|cartoons?|video|puzzles-and-games-dept|crossword|newsletters?|account|about|tag|contributors|latest|magazine\/?$)/;

export async function newYorkerPopular(limit: number): Promise<PopularItem[]> {
  const html = await fetchHtml("https://www.newyorker.com/");
  const paths = [...html.matchAll(/href="(\/[a-z0-9-]+\/[^"#?]+)"/g)]
    .map((m) => m[1])
    // Real articles have at least 2 path segments after the section, e.g. /news/the-lede/slug
    // or /magazine/2026/10/05/slug.
    .filter((p) => p.split("/").filter(Boolean).length >= 3 && !NEW_YORKER_SKIP.test(p));
  return uniqueInOrder(paths)
    .slice(0, limit)
    .map((p, i) => ({ source: "newyorker", url: `https://www.newyorker.com${p}`, rank: i + 1, bodyFetchable: true }));
}

export async function buzzfeedPopular(limit: number): Promise<PopularItem[]> {
  const html = await fetchHtml("https://www.buzzfeed.com/trending");
  const paths = [...html.matchAll(/class="js-card__link[^"]*"\s+href="(\/[a-z0-9_.]+\/[a-z0-9-]+)"/g)]
    .map((m) => m[1])
    .filter((p) => !p.startsWith("/shopping/") && !p.startsWith("/quizzes"));
  return uniqueInOrder(paths)
    .slice(0, limit)
    .map((p, i) => ({ source: "buzzfeed", url: `https://www.buzzfeed.com${p}`, rank: i + 1, bodyFetchable: true }));
}

// Single-segment slugs are articles (https://lithub.com/some-article-slug/); sections,
// authors and tags have short or multi-segment paths.
export async function lithubPopular(limit: number): Promise<PopularItem[]> {
  const html = await fetchHtml("https://lithub.com/");
  const urls = [...html.matchAll(/href="(https:\/\/lithub\.com\/[a-z0-9-]{15,}\/)"/g)].map((m) => m[1]);
  return uniqueInOrder(urls)
    .slice(0, limit)
    .map((url, i) => ({ source: "lithub", url, rank: i + 1, bodyFetchable: true }));
}

const WBW_POST = /https:\/\/waitbutwhy\.com\/\d{4}\/\d{2}\/[a-z0-9-]+\.html/;

export async function waitButWhyPopular(limit: number): Promise<PopularItem[]> {
  const [feed, home] = await Promise.all([fetchHtml("https://waitbutwhy.com/feed"), fetchHtml("https://waitbutwhy.com/")]);
  const newest = [...feed.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)].map((m) => m[1].trim()).slice(0, 1);
  const start = home.indexOf("popular_widget");
  const widget = start < 0 ? "" : home.slice(start, home.indexOf("</ul>", home.indexOf("post-list", start)));
  const popular = [...widget.matchAll(/<h5>\s*<a href="([^"]+)"/g)].map((m) => m[1]);
  return uniqueInOrder([...newest, ...popular].filter((u) => WBW_POST.test(u)))
    .slice(0, limit)
    .map((url, i) => ({ source: "waitbutwhy", url, rank: i + 1, bodyFetchable: true }));
}

const MODERN_LOVE_FEED = "https://www.nytimes.com/svc/collections/v1/publish/www.nytimes.com/column/modern-love/rss.xml";

const decodeXml = (s: string) =>
  s
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

function xmlTag(item: string, tag: string): string | null {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(item);
  return m ? decodeXml(m[1]) : null;
}

export async function modernLovePopular(limit: number): Promise<PopularItem[]> {
  const xml = await fetchHtml(MODERN_LOVE_FEED);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  return items
    .map((item) => {
      const pubDate = xmlTag(item, "pubDate");
      return {
        url: xmlTag(item, "link") ?? "",
        title: xmlTag(item, "title") ?? undefined,
        excerpt: xmlTag(item, "description"),
        byline: xmlTag(item, "dc:creator"),
        publishedAt: pubDate && !Number.isNaN(Date.parse(pubDate)) ? new Date(pubDate).toISOString() : null,
        imageUrl: /<media:content[^>]*url="([^"]+)"/.exec(item)?.[1]?.replace(/&amp;/g, "&") ?? null,
      };
    })
    // Skip the podcast episodes that share the feed; keep the written essays.
    .filter((it) => it.url.startsWith("https://www.nytimes.com/") && !it.url.includes("/podcasts/"))
    .slice(0, limit)
    .map((it, i) => ({ ...it, source: "modernlove", rank: i + 1, bodyFetchable: false }));
}

export async function popularFor(source: FeedSourceId, limit: number): Promise<PopularItem[]> {
  switch (source) {
    case "newyorker":
      return newYorkerPopular(limit);
    case "buzzfeed":
      return buzzfeedPopular(limit);
    case "modernlove":
      return modernLovePopular(limit);
    case "lithub":
      return lithubPopular(limit);
    case "waitbutwhy":
      return waitButWhyPopular(limit);
  }
}
