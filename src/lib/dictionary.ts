import { splitWords } from "./tokenize";

// English definitions for the reader popover and the word list. Wiktionary's REST API
// is the primary source (fast, CORS-enabled); dictionaryapi.dev is a fallback that
// also provides phonetics. Both are free and keyless. Multi-word expressions
// ("give up", "look forward to") have their own Wiktionary entries.

export interface Definition {
  phonetic: string | null;
  meanings: { partOfSpeech: string; definition: string }[];
}

interface WiktionaryEntry {
  partOfSpeech: string;
  definitions: { definition: string }[];
}

interface DictionaryApiEntry {
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings?: { partOfSpeech: string; definitions: { definition: string }[] }[];
}

const TIMEOUT_MS = 5000;

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function fromWiktionary(word: string): Promise<Definition | null> {
  const data = await getJson<{ en?: WiktionaryEntry[] }>(
    `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word.replace(/ /g, "_"))}`,
  );
  const meanings = (data?.en ?? [])
    .map((e) => ({
      partOfSpeech: e.partOfSpeech.toLowerCase(),
      definition: e.definitions.map((d) => stripHtml(d.definition)).find(Boolean) ?? "",
    }))
    .filter((m) => m.definition)
    .slice(0, 3);
  return meanings.length ? { phonetic: null, meanings } : null;
}

async function fromDictionaryApi(word: string): Promise<Definition | null> {
  const entries = await getJson<DictionaryApiEntry[]>(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
  );
  if (!Array.isArray(entries)) return null;
  const phonetic = entries.map((e) => e.phonetic || e.phonetics?.find((p) => p.text)?.text).find(Boolean) ?? null;
  const meanings = entries
    .flatMap((e) => e.meanings ?? [])
    .map((m) => ({ partOfSpeech: m.partOfSpeech, definition: m.definitions[0]?.definition ?? "" }))
    .filter((m) => m.definition)
    .slice(0, 3);
  return meanings.length ? { phonetic, meanings } : null;
}

export async function lookup(word: string): Promise<Definition | null> {
  return (await fromWiktionary(word)) ?? (await fromDictionaryApi(word));
}

export function formatDefinition(d: Definition | null): string | null {
  return d ? d.meanings.map((m) => `(${m.partOfSpeech}) ${m.definition}`).join("\n") : null;
}

export const naverDictUrl = (word: string) => `https://en.dict.naver.com/#/search?query=${encodeURIComponent(word)}`;

// "Ruthless," -> "ruthless"; keeps inner apostrophes/hyphens ("don't", "well-known").
export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .replace(/'s$/, "");
}

// A saved entry: one word, or a phrase like "look forward to". Tokenizes the same way
// as the reader, so a saved phrase can be matched back against the text.
export function normalizePhrase(raw: string): string {
  return splitWords(raw)
    .filter((t) => t.word)
    .map((t) => normalizeWord(t.text))
    .filter(Boolean)
    .join(" ");
}
