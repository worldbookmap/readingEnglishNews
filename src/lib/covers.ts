import "server-only";

// Finds a cover image for a book typed in or loaded from a file: Open Library first
// (classics and most print books), then Apple Books' search API (recent ebooks).
// Neither needs an API key.

const TIMEOUT = 6000;

// "The Daily Stoic: 366 Meditations…" → "the daily stoic"
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[:;(\[].*$/, "")
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^(the|a|an) /, "")
    .trim();

// Search results are only used when they're plausibly the same book.
const sameTitle = (a: string, b: string) => {
  const [x, y] = [normalize(a), normalize(b)];
  return !!x && !!y && (x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `));
};

const firstAuthor = (author: string | null) => author?.split(/,| and /)[0].trim() || null;

async function openLibraryCover(title: string, author: string | null): Promise<string | null> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("title", title.replace(/[:;].*$/, ""));
  const a = firstAuthor(author);
  if (a) url.searchParams.set("author", a);
  url.searchParams.set("fields", "title,cover_i");
  url.searchParams.set("limit", "5");
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) return null;
  const { docs } = (await res.json()) as { docs: { title: string; cover_i?: number }[] };
  const doc = docs.find((d) => d.cover_i && sameTitle(d.title, title));
  return doc ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null;
}

async function appleBooksCover(title: string, author: string | null): Promise<string | null> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", [title.replace(/[:;].*$/, ""), firstAuthor(author)].filter(Boolean).join(" "));
  url.searchParams.set("media", "ebook");
  url.searchParams.set("limit", "5");
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) return null;
  const { results } = (await res.json()) as { results: { trackName: string; artworkUrl100?: string }[] };
  const hit = results.find((r) => r.artworkUrl100 && sameTitle(r.trackName, title));
  // The URL names its size; ask for a larger rendition.
  return hit ? hit.artworkUrl100!.replace(/\/\d+x\d+bb\./, "/400x600bb.") : null;
}

export async function findCover(title: string, author: string | null): Promise<string | null> {
  for (const find of [openLibraryCover, appleBooksCover]) {
    try {
      const url = await find(title, author);
      if (url) return url;
    } catch {
      // Try the next source.
    }
  }
  return null;
}
