// Deterministic sentence/word splitting. (Intl.Segmenter output depends on the ICU
// version, so server and browser could disagree and break hydration.)

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "mt", "vs", "etc", "inc", "ltd", "co", "corp",
  "gen", "gov", "sen", "rep", "col", "lt", "sgt", "capt", "rev", "no", "fig", "approx", "jan", "feb",
  "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "e.g", "i.e",
]);

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const boundary = /[.!?…]+["”’)\]]*\s+/g;
  let start = 0;
  for (let m = boundary.exec(text); m; m = boundary.exec(text)) {
    const end = m.index + m[0].length;
    const next = text[end];
    const before = text.slice(start, m.index + 1);
    const lastWord = /([A-Za-z.]+)\.$/.exec(before)?.[1]?.toLowerCase() ?? "";
    const isAbbrev =
      ABBREVIATIONS.has(lastWord) ||
      /(^|[\s(])[A-Z]\.$/.test(before) || // initials: "J. Smith"
      /(^|[\s(])(?:[A-Za-z]\.){2,}$/.test(before); // "U.S." / "T.P.S." mid-sentence
    // A new sentence starts with a capital, digit or opening quote.
    if (!isAbbrev && next && /[A-Z0-9"“‘'(\[]/.test(next)) {
      out.push(text.slice(start, end).trim());
      start = end;
    }
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

export interface Token {
  text: string;
  word: boolean;
}

const WORD = /([A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*)/;

export function splitWords(sentence: string): Token[] {
  return sentence
    .split(WORD)
    .map((text, i) => ({ text, word: i % 2 === 1 }))
    .filter((t) => t.text);
}
