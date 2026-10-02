import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Block } from "./extract";
import type { SourceId } from "./sources";
import type { StudySource } from "./studySources";

export interface ArticleRow {
  id: string;
  source: SourceId;
  url: string;
  title: string;
  byline: string | null;
  excerpt: string | null;
  image_url: string | null;
  published_at: string | null;
  blocks: Block[];
  word_count: number;
  popular_on: string;
  popular_rank: number;
  fetched_at: string;
  first_opened_at: string | null; // "클릭함": set automatically when the article is opened
  last_opened_at: string | null;
  open_count: number;
  read_at: string | null; // "읽었음": set when the reader marks it as read
}

export type ArticleSummary = Omit<ArticleRow, "blocks">;
export const ARTICLE_SUMMARY_COLUMNS =
  "id, source, url, title, byline, excerpt, image_url, published_at, word_count, popular_on, popular_rank, fetched_at, first_opened_at, last_opened_at, open_count, read_at";

export interface SavedWordRow {
  id: string;
  word: string;
  context: string | null;
  definition: string | null;
  phonetic: string | null;
  note: string | null;
  article_id: string;
  created_at: string;
}

export interface StudyWordRow {
  source: StudySource;
  id: string;
  word: string;
  meaning: string;
  created_at: string;
  imported_at: string;
}

export interface SavedSentenceRow {
  id: string;
  text: string;
  note: string | null;
  article_id: string;
  created_at: string;
}

let client: SupabaseClient | null = null;

// Server-only client using the service-role key. Never import this from client components.
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
