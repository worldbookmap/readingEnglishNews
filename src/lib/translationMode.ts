// How the reader shows a book's Korean translations (from the 번역 노트 extension), kept
// per device in a cookie so the server renders the right layout: hidden, under each
// paragraph, or in place of the English.
export const TRANSLATION_COOKIE = "ren_translation";
export type TranslationMode = "hide" | "below" | "only";
export const translationMode = (v: string | undefined): TranslationMode => (v === "below" || v === "only" ? v : "hide");
