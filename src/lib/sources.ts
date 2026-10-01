// Finds the "most popular" article URLs for each source.
//
// - BuzzFeed: https://www.buzzfeed.com/trending is server-rendered as a ranked list
//   (cards numbered 1, 2, 3 ... from BuzzFeed's trending feed).
// - The New Yorker: no public "most popular" list exists (the widget is empty in the
//   server HTML and isn't loaded anywhere public), so we use the homepage's editorial
//   order — the top stories the editors are featuring — as the popularity proxy.

export type SourceId = "newyorker" | "buzzfeed";

export interface PopularItem {
  source: SourceId;
  url: string;
  rank: number;
}

export const SOURCE_LABELS: Record<SourceId, string> = {
  newyorker: "The New Yorker",
  buzzfeed: "BuzzFeed",
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
    .map((p, i) => ({ source: "newyorker", url: `https://www.newyorker.com${p}`, rank: i + 1 }));
}

export async function buzzfeedPopular(limit: number): Promise<PopularItem[]> {
  const html = await fetchHtml("https://www.buzzfeed.com/trending");
  const paths = [...html.matchAll(/class="js-card__link[^"]*"\s+href="(\/[a-z0-9_.]+\/[a-z0-9-]+)"/g)]
    .map((m) => m[1])
    .filter((p) => !p.startsWith("/shopping/") && !p.startsWith("/quizzes"));
  return uniqueInOrder(paths)
    .slice(0, limit)
    .map((p, i) => ({ source: "buzzfeed", url: `https://www.buzzfeed.com${p}`, rank: i + 1 }));
}

export async function popularFor(source: SourceId, limit: number): Promise<PopularItem[]> {
  return source === "newyorker" ? newYorkerPopular(limit) : buzzfeedPopular(limit);
}
