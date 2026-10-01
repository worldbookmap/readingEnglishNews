// worldbookmap/studylang files shown on the 암기장 page, keyed by the `source` stored in study_words.
export const STUDY_SOURCES = {
  colly: "study-colly",
  baebjji: "study-baebjji",
} as const;
export type StudySource = keyof typeof STUDY_SOURCES;

export const STUDY_SOURCE_LABELS: Record<StudySource, string> = {
  colly: "콜리",
  baebjji: "뱁찌",
};
