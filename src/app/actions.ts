"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, authToken } from "@/lib/auth";
import { formatDefinition, lookup, normalizeWord } from "@/lib/dictionary";
import { ingestPopular } from "@/lib/ingest";
import type { Block } from "@/lib/extract";
import { db, type SavedSentenceRow, type SavedWordRow } from "@/lib/supabase";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  (await cookies()).set(AUTH_COOKIE, await authToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function markOpened(articleId: string) {
  const { error } = await db().rpc("mark_article_opened", { p_id: articleId });
  if (error) throw error;
  revalidatePath("/");
  revalidatePath("/history");
}

export async function setRead(articleId: string, read: boolean) {
  const { error } = await db()
    .from("articles")
    .update({ read_at: read ? new Date().toISOString() : null })
    .eq("id", articleId);
  if (error) throw error;
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath(`/articles/${articleId}`);
}

// For sources whose body can't be fetched (NYT Modern Love): the reader copies the
// article text from the original page and pastes it here. Each line becomes a paragraph;
// short lines without closing punctuation are treated as section headings.
export async function setArticleBody(articleId: string, text: string) {
  const blocks: Block[] = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((line) => ({ type: line.length < 70 && !/[.!?"”’:)]$/.test(line) ? "h" : "p", text: line }));
  const wordCount = blocks.reduce((n, b) => (b.type === "img" ? n : n + b.text.split(" ").length), 0);
  if (wordCount < 30) throw new Error("본문이 너무 짧아요");
  const { error } = await db().from("articles").update({ blocks, word_count: wordCount }).eq("id", articleId);
  if (error) throw error;
  revalidatePath("/");
  revalidatePath(`/articles/${articleId}`);
}

export async function saveWord(input: {
  articleId: string;
  word: string;
  context: string;
  definition?: string | null;
  phonetic?: string | null;
}): Promise<SavedWordRow> {
  const word = normalizeWord(input.word);
  if (!word) throw new Error("empty word");
  let { definition = null, phonetic = null } = input;
  if (definition == null) {
    const d = await lookup(word);
    definition = formatDefinition(d);
    phonetic = d?.phonetic ?? null;
  }
  const { data, error } = await db()
    .from("saved_words")
    .upsert(
      { word, context: input.context.slice(0, 1000), definition, phonetic, article_id: input.articleId },
      { onConflict: "word,article_id" },
    )
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/words");
  return data as SavedWordRow;
}

export async function removeWord(id: string) {
  const { error } = await db().from("saved_words").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/words");
}

export async function saveSentence(input: { articleId: string; text: string }): Promise<SavedSentenceRow> {
  const text = input.text.replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!text) throw new Error("empty sentence");
  const { data, error } = await db()
    .from("saved_sentences")
    .upsert({ text, article_id: input.articleId }, { onConflict: "text,article_id" })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/sentences");
  return data as SavedSentenceRow;
}

export async function removeSentence(id: string) {
  const { error } = await db().from("saved_sentences").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/sentences");
}

export async function updateSentenceNote(id: string, note: string) {
  const { error } = await db().from("saved_sentences").update({ note: note.trim() || null }).eq("id", id);
  if (error) throw error;
  revalidatePath("/sentences");
}

// Manual "fetch now" button on the home page (the daily cron does the same thing).
export async function fetchNow() {
  const result = await ingestPopular();
  revalidatePath("/");
  return { saved: result.saved.length, skipped: result.skipped.filter((s) => s.reason !== "already saved").length };
}
