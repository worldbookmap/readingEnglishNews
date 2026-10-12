import { splitWords } from "./tokenize";

// English definitions and IPA for the reader popover and the word list, looked up in
// the browser (all sources are free, keyless and CORS-enabled):
// - Wiktionary definitions. Inflected forms ("smuggled", "ran") only say "past of
//   smuggle", so those follow the link to the base word and use its definitions.
// - Wiktionary IPA and native-speaker recordings from the entry's wikitext
//   ({{IPA|en|/ˈsmʌɡəl/}}, {{audio|en|En-us-smuggle.ogg|a=US}}), played from Wikimedia Commons.
// - Datamuse (WordNet/Wiktionary data, CMU pronouncing dictionary) when Wiktionary
//   has no entry or no IPA. Multi-word expressions ("look forward to") work in both.

export interface Definition {
  phonetic: string | null;
  meanings: { partOfSpeech: string; definition: string }[];
  headword?: string; // the base word the meanings belong to, when different ("smuggled" → "smuggle")
  recordings?: Recording[];
}

// A native speaker's recording on Wikimedia Commons, labelled by accent ("미국", "영국").
export interface Recording {
  file: string;
  accent: string;
  url: string; // Commons' MP3 transcode, which plays everywhere (Safari can't play .ogg)
}

interface WiktionaryEntry {
  partOfSpeech: string;
  definitions: { definition: string }[];
}

interface DatamuseWord {
  word: string;
  tags?: string[];
  defs?: string[];
}

const TIMEOUT_MS = 5000;
const MAX_MEANINGS = 3;

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
    .replace(/ ([;,.:])/g, "$1")
    .trim();

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const wiktionaryTitle = (word: string) => encodeURIComponent(word.replace(/ /g, "_"));

// Entries that aren't the everyday word: "ran" is also an ISO language code, "agents" a band.
const SKIPPED_POS = new Set(["symbol", "proper noun", "letter", "number"]);

// The word's own meanings, plus the base word when its main sense is "<form> of <base>"
// ("ran" → "run", "agents" → "agent").
async function wiktionaryMeanings(
  word: string,
): Promise<{ meanings: Definition["meanings"]; formOf: { base: string; partOfSpeech: string } | null }> {
  const data = await getJson<{ en?: WiktionaryEntry[] }>(
    `https://en.wiktionary.org/api/rest_v1/page/definition/${wiktionaryTitle(word)}`,
  );
  const meanings: Definition["meanings"] = [];
  let formOf: { base: string; partOfSpeech: string } | null = null;
  let first = true;
  for (const entry of data?.en ?? []) {
    const partOfSpeech = entry.partOfSpeech.toLowerCase();
    if (SKIPPED_POS.has(partOfSpeech)) continue;
    const own = entry.definitions.find((d) => !d.definition.includes("form-of-definition") && stripHtml(d.definition));
    if (own) meanings.push({ partOfSpeech, definition: stripHtml(own.definition) });
    else if (first) {
      const base = entry.definitions
        .map((d) => d.definition.match(/form-of-definition-link[\s\S]*?<a [^>]*title="([^"]+)"/)?.[1])
        .find(Boolean);
      if (base) formOf = { base: base.replace(/&#39;/g, "'"), partOfSpeech };
    }
    first = false;
  }
  return { meanings: meanings.slice(0, MAX_MEANINGS), formOf };
}

const ACCENTS: [RegExp, string][] = [
  [/\b(US|GA|General American|American|cot-caught)\b/i, "미국"],
  [/\b(UK|RP|SSB|England|English|British|Scotland|Wales)\b/i, "영국"],
  [/\b(AU|Australia|Queensland|NZ|New Zealand)\b/i, "호주"],
  [/\b(CA|Canada|Canadian)\b/i, "캐나다"],
];
const ACCENT_ORDER = ["미국", "영국", "호주", "캐나다", "기타"];

function accentLabel(accent: string | undefined, file: string): string {
  // Without "a=", files are usually named "En-us-…", "En-uk-…", "En-au-…".
  const hint = accent ?? file.match(/^en-(us|uk|au|ca)-/i)?.[1] ?? "";
  return ACCENTS.find(([re]) => re.test(hint))?.[1] ?? "기타";
}

async function wiktionaryPronunciation(word: string): Promise<{ ipa: string | null; recordings: Recording[] }> {
  const data = await getJson<{ parse?: { wikitext?: string } }>(
    `https://en.wiktionary.org/w/api.php?action=parse&page=${wiktionaryTitle(word)}&prop=wikitext&format=json&formatversion=2&origin=*`,
  );
  const text = data?.parse?.wikitext ?? "";
  const start = text.indexOf("==English==");
  if (start < 0) return { ipa: null, recordings: [] };
  const rest = text.slice(start + 11);
  const nextLanguage = rest.search(/\n==[^=]/);
  const english = nextLanguage < 0 ? rest : rest.slice(0, nextLanguage);
  const template = english.match(/\{\{IPA\|en\|([^}]*)\}\}/)?.[1];
  const ipa = template?.split("|").find((part) => /^[/[]/.test(part.trim()))?.trim() ?? null;

  // One recording per accent, American first.
  const byAccent = new Map<string, { file: string; accent: string }>();
  for (const [, params] of english.matchAll(/\{\{audio\|en\|([^}]*)\}\}/g)) {
    const [file, ...named] = params.split("|").map((p) => p.trim());
    const accent = named.find((p) => p.startsWith("a="))?.slice(2);
    const label = accentLabel(accent, file);
    if (file && !byAccent.has(label)) byAccent.set(label, { file, accent: label });
  }
  const picked = [...byAccent.values()]
    .sort((a, b) => ACCENT_ORDER.indexOf(a.accent) - ACCENT_ORDER.indexOf(b.accent))
    .slice(0, 3);
  // URLs are resolved up front so a tap can start playback right away (iOS only allows
  // audio that starts during the tap itself).
  const urls = await commonsAudioUrls(picked.map((r) => r.file));
  const recordings = picked.flatMap((r) => (urls.has(r.file) ? [{ ...r, url: urls.get(r.file)! }] : []));
  return { ipa, recordings };
}

async function commonsAudioUrls(files: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (!files.length) return urls;
  const data = await getJson<{
    query?: {
      normalized?: { from: string; to: string }[];
      pages?: { title: string; videoinfo?: { url: string; derivatives?: { type: string; src: string }[] }[] }[];
    };
  }>(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(files.map((f) => `File:${f}`).join("|"))}&prop=videoinfo&viprop=url|derivatives&format=json&formatversion=2&origin=*`,
  );
  const titleOf = new Map((data?.query?.normalized ?? []).map((n) => [n.from, n.to]));
  for (const file of files) {
    const title = titleOf.get(`File:${file}`) ?? `File:${file}`;
    const info = data?.query?.pages?.find((p) => p.title === title)?.videoinfo?.[0];
    const url = info?.derivatives?.find((d) => d.type === "audio/mpeg")?.src ?? info?.url;
    if (url) urls.set(file, url);
  }
  return urls;
}

// For the word list, where only the word is stored: fetched when the speaker is pressed.
export const recordingsFor = async (word: string) => (await wiktionaryPronunciation(word)).recordings;

const DATAMUSE_POS: Record<string, string> = { n: "noun", v: "verb", adj: "adjective", adv: "adverb" };

// Meanings and IPA without slashes ("ˈsmʌɡəl").
async function datamuse(word: string): Promise<{ meanings: Definition["meanings"]; ipa: string | null }> {
  const data = await getJson<DatamuseWord[]>(
    `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&qe=sp&md=dr&max=1`,
  );
  const hit = data?.[0]?.word.toLowerCase() === word.toLowerCase() ? data[0] : undefined;
  const meanings = (hit?.defs ?? [])
    .map((d) => {
      const [pos, definition = ""] = d.split("\t");
      return { partOfSpeech: DATAMUSE_POS[pos], definition: definition.trim() };
    })
    .filter((m) => m.partOfSpeech && m.definition && !/^A (sur|male given |female given )?name\b/.test(m.definition))
    .slice(0, MAX_MEANINGS);
  const arpabet = hit?.tags?.find((t) => t.startsWith("pron:"))?.slice(5);
  return { meanings, ipa: arpabet ? arpabetToIpa(arpabet) : null };
}

// CMU dictionary ARPAbet ("S M AH1 G AH0 L") → IPA ("ˈsmʌɡəl", US pronunciation).
const ARPABET: Record<string, string> = {
  AA: "ɑ", AE: "æ", AH: "ʌ", AO: "ɔ", AW: "aʊ", AY: "aɪ", EH: "ɛ", ER: "ɝ", EY: "eɪ", IH: "ɪ",
  IY: "i", OW: "oʊ", OY: "ɔɪ", UH: "ʊ", UW: "u", B: "b", CH: "tʃ", D: "d", DH: "ð", F: "f",
  G: "ɡ", HH: "h", JH: "dʒ", K: "k", L: "l", M: "m", N: "n", NG: "ŋ", P: "p", R: "ɹ", S: "s",
  SH: "ʃ", T: "t", TH: "θ", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ",
};
// Consonant pairs that can start an English syllable, so "smuggle" is stressed as "ˈsm…".
const ONSET_PAIR = /^(s[ptkmnlwf]|[pbkɡf][lɹ]|[td][ɹw]|θɹ|ʃɹ|[kɡ]w|[pbkmhfv]j)$/;

function arpabetToIpa(arpabet: string): string | null {
  const phones = arpabet.trim().split(/\s+/).map((p) => {
    const m = p.match(/^([A-Z]+)([012])?$/);
    if (!m || !ARPABET[m[1]]) return null;
    const vowel = m[2] !== undefined;
    // Unstressed AH/ER are schwas.
    const ipa = m[2] === "0" && m[1] === "AH" ? "ə" : m[2] === "0" && m[1] === "ER" ? "ɚ" : ARPABET[m[1]];
    return { ipa, vowel, stress: m[2] === "1" ? "ˈ" : m[2] === "2" ? "ˌ" : "" };
  });
  if (phones.some((p) => p === null)) return null;
  const out = phones.map((p) => p!.ipa);
  phones.forEach((p, i) => {
    if (!p!.stress) return;
    let start = i;
    // Pull up to two preceding consonants into the stressed syllable when they form an onset.
    if (i > 0 && !phones[i - 1]!.vowel) {
      start = i - 1;
      if (i > 1 && !phones[i - 2]!.vowel && ONSET_PAIR.test(out[i - 2] + out[i - 1])) start = i - 2;
    }
    out[start] = p!.stress + out[start];
  });
  return out.join("");
}

export async function lookup(word: string): Promise<Definition | null> {
  // A phrase's CMU pronunciation runs its words together, so phrases get one per word.
  const parts = word.includes(" ") ? word.split(" ") : [];
  const [wiki, pron, dm, ...partsDm] = await Promise.all([
    wiktionaryMeanings(word),
    wiktionaryPronunciation(word),
    datamuse(word),
    ...parts.map(datamuse),
  ]);
  let { meanings } = wiki;
  let headword: string | undefined;
  if (wiki.formOf) {
    const { base, partOfSpeech } = wiki.formOf;
    let baseMeanings = (await wiktionaryMeanings(base)).meanings;
    if (!baseMeanings.length) baseMeanings = (await datamuse(base)).meanings;
    if (baseMeanings.length) {
      // "loomed" is a verb, so loom's verb sense comes before its noun senses.
      const samePos = baseMeanings.filter((m) => m.partOfSpeech === partOfSpeech);
      const otherPos = baseMeanings.filter((m) => m.partOfSpeech !== partOfSpeech);
      meanings = [...samePos, ...otherPos, ...meanings].slice(0, MAX_MEANINGS);
      headword = base;
    }
  }
  if (!meanings.length) meanings = dm.meanings;
  // "looked forward to" → "look forward to".
  if (!meanings.length && parts.length) {
    const first = (await wiktionaryMeanings(parts[0])).formOf?.base;
    const basePhrase = first && [first, ...parts.slice(1)].join(" ");
    const found = basePhrase ? await lookup(basePhrase) : null;
    if (found) {
      meanings = found.meanings;
      headword = basePhrase!;
    }
  }
  // The pronunciation stays the looked-up word's own ("ran", not "run").
  const cmu = parts.length ? (partsDm.every((p) => p.ipa) ? partsDm.map((p) => p.ipa).join(" ") : null) : dm.ipa;
  const phonetic = pron.ipa ?? (cmu ? `/${cmu}/` : null);
  return meanings.length ? { phonetic, meanings, recordings: pron.recordings, ...(headword ? { headword } : {}) } : null;
}

export function formatDefinition(d: Definition | null): string | null {
  if (!d) return null;
  const lines = d.meanings.map((m) => `(${m.partOfSpeech}) ${m.definition}`);
  return (d.headword ? [`원형 ${d.headword}`, ...lines] : lines).join("\n");
}

export const naverDictUrl = (word: string) => `https://en.dict.naver.com/#/search?query=${encodeURIComponent(word)}`;

// YouGlish: YouTube clips where the word or phrase is spoken.
export const youglishUrl = (phrase: string) => `https://youglish.com/pronounce/${encodeURIComponent(phrase)}/english`;

// PlayPhrase: movie and TV clips containing the phrase.
export const playphraseUrl = (phrase: string) =>
  `https://www.playphrase.me/#/search?q=${encodeURIComponent(phrase)}&language=en`;

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
