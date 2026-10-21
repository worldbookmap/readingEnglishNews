"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, authToken } from "@/lib/auth";
import { formatDefinition, lookup, normalizePhrase } from "@/lib/dictionary";
import { importArchiveBook, importPublicBook, importStandardEbook, saveBook, type PublicSource } from "@/lib/books";
import { analyze, GRAMMAR_MODEL, MAX_GRAMMAR_CHARS, type Grammar } from "@/lib/grammar";
import { ingestPopular, ingestUrl } from "@/lib/ingest";
import { importStudyWords } from "@/lib/studylang";
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
  revalidatePath("/books", "layout");
  revalidatePath(`/articles/${articleId}`);
}

export async function setReread(articleId: string, reread: boolean) {
  const { error } = await db()
    .from("articles")
    .update({ reread_at: reread ? new Date().toISOString() : null })
    .eq("id", articleId);
  if (error) throw error;
  revalidatePath("/history");
  revalidatePath("/books", "layout");
  revalidatePath(`/articles/${articleId}`);
}

// Removes the article; its saved words and sentences go with it (on delete cascade).
export async function deleteArticle(articleId: string) {
  const { data, error } = await db().from("articles").delete().eq("id", articleId).select("source");
  if (error) throw error;
  revalidatePath("/");
  revalidatePath("/books");
  revalidatePath("/history");
  revalidatePath("/words");
  revalidatePath("/memorize");
  redirect(data?.[0]?.source === "book" ? "/books" : "/");
}

// "기사 추가" on the home page: save one article by URL and open it.
export async function addArticle(formData: FormData) {
  let url: URL;
  try {
    url = new URL(String(formData.get("url") ?? "").trim());
  } catch {
    redirect("/?addError=1");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") redirect("/?addError=1");
  url.hash = "";
  const id = await ingestUrl(url.toString());
  revalidatePath("/");
  redirect(`/articles/${id}`);
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

// "직접 입력" on 책: the reader types or pastes a whole book (or a .txt file's contents).
export async function addBook(_prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const title = String(formData.get("title") ?? "").replace(/\s+/g, " ").trim();
  const author = String(formData.get("author") ?? "").replace(/\s+/g, " ").trim();
  const text = String(formData.get("text") ?? "");
  if (!title) return { error: "제목을 입력해주세요" };
  let id: string;
  try {
    id = await saveBook({ url: `book:${crypto.randomUUID()}`, title, author: author || null, summary: null, imageUrl: null, text });
  } catch (e) {
    return { error: e instanceof Error && e.message === "본문이 너무 짧아요" ? e.message : "저장하지 못했어요. 다시 시도해주세요" };
  }
  revalidatePath("/");
  revalidatePath("/books");
  redirect(`/books/${id}`);
}

// "가져오기" on a Project Gutenberg / Standard Ebooks / Internet Archive search result.
export async function importBook(source: PublicSource, bookId: string): Promise<{ error: string }> {
  let id: string;
  try {
    if (source === "archive") id = await importArchiveBook(bookId);
    else if (source === "standard") id = await importStandardEbook(bookId);
    else {
      const n = Number(bookId);
      if (!Number.isInteger(n) || n <= 0) return { error: "잘못된 항목이에요" };
      id = await importPublicBook(n);
    }
  } catch (e) {
    // Messages written for the reader are in Korean; anything else is a network/API error.
    const message = e instanceof Error && /[가-힣]/.test(e.message) ? e.message : "가져오지 못했어요. 잠시 후 다시 시도해주세요";
    return { error: message };
  }
  revalidatePath("/");
  revalidatePath("/books");
  redirect(`/books/${id}`);
}

// Opening a book page counts as 클릭함 and remembers the page to resume from.
export async function openBookPage(articleId: string, page: number, remember = true) {
  const [opened, updated] = await Promise.all([
    db().rpc("mark_article_opened", { p_id: articleId }),
    // Moving to another page starts it from the top.
    remember
      ? db().from("articles").update({ current_page: page, current_block: 0 }).eq("id", articleId).neq("current_page", page)
      : { error: null },
  ]);
  if (opened.error) throw opened.error;
  if (updated.error) throw updated.error;
  revalidatePath("/");
  revalidatePath("/books");
  revalidatePath("/history");
}

// Saved while scrolling a book page. No revalidation: it would re-render the page
// being read, and the book lists only show the page number (kept fresh by openBookPage).
export async function saveBookPosition(articleId: string, page: number, block: number) {
  if (!Number.isInteger(page) || !Number.isInteger(block) || page < 1 || block < 0) return;
  const { error } = await db().from("articles").update({ current_page: page, current_block: block }).eq("id", articleId);
  if (error) throw error;
}

export async function saveWord(input: {
  articleId: string;
  word: string;
  context: string;
  definition?: string | null;
  phonetic?: string | null;
  note?: string | null;
}): Promise<SavedWordRow> {
  const word = normalizePhrase(input.word);
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
      {
        word,
        context: input.context.slice(0, 1000),
        definition,
        phonetic,
        note: input.note?.trim() || null,
        article_id: input.articleId,
      },
      { onConflict: "word,article_id" },
    )
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/words");
  revalidatePath("/memorize");
  return data as SavedWordRow;
}

export async function removeWord(id: string) {
  const { error } = await db().from("saved_words").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/words");
  revalidatePath("/memorize");
}

export async function updateWordNote(id: string, note: string): Promise<SavedWordRow> {
  const { data, error } = await db()
    .from("saved_words")
    .update({ note: note.trim() || null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/words");
  return data as SavedWordRow;
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
  revalidatePath("/words");
  return data as SavedSentenceRow;
}

export async function removeSentence(id: string) {
  const { error } = await db().from("saved_sentences").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/words");
}

export async function updateSentenceNote(id: string, note: string) {
  const { error } = await db().from("saved_sentences").update({ note: note.trim() || null }).eq("id", id);
  if (error) throw error;
  revalidatePath("/words");
}

// "문법 분석" on a dragged sentence. Each sentence is sent to Claude once; later requests
// come from grammar_analyses.
export async function analyzeGrammar(text: string): Promise<{ grammar: Grammar } | { error: string }> {
  const sentence = text.replace(/\s+/g, " ").trim();
  if (!sentence) return { error: "분석할 문장이 없어요" };
  if (sentence.length > MAX_GRAMMAR_CHARS) return { error: "너무 길어요. 한두 문장만 선택해주세요" };
  const cached = await db().from("grammar_analyses").select("result").eq("sentence", sentence).maybeSingle();
  if (cached.error) throw cached.error;
  if (cached.data) return { grammar: cached.data.result as Grammar };
  const grammar = await analyze(sentence);
  const { error } = await db().from("grammar_analyses").upsert({ sentence, result: grammar, model: GRAMMAR_MODEL });
  if (error) throw error;
  return { grammar };
}

// Manual "fetch now" button on the home page (the daily cron does the same thing).
export async function fetchNow() {
  const result = await ingestPopular();
  revalidatePath("/");
  return { saved: result.saved.length, skipped: result.skipped.filter((s) => s.reason !== "already saved").length };
}

// Manual "새로 불러오기" on the 암기장 page: re-import every studylang profile.
export async function refreshStudyWords() {
  const result = await importStudyWords();
  revalidatePath("/memorize");
  return result;
}
