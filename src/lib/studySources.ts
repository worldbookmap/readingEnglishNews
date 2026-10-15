// studylang profiles shown on the 암기장 page, keyed by the `source` stored in study_words.
// Each value is the profile id the studylang API expects in `?user=`.
export const STUDY_SOURCES = {
  colly: "colly",
  baebjji: "baebjji",
} as const;
export type StudySource = keyof typeof STUDY_SOURCES;

export const STUDY_SOURCE_LABELS: Record<StudySource, string> = {
  colly: "콜리",
  baebjji: "뱁찌",
};
