"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { removeSentence, removeWord, saveSentence, saveWord, updateWordNote } from "@/app/actions";
import { formatDefinition, lookup, naverDictUrl, normalizePhrase, normalizeWord, type Definition } from "@/lib/dictionary";
import type { Block } from "@/lib/extract";
import type { SavedSentenceRow, SavedWordRow } from "@/lib/supabase";
import { splitSentences, splitWords, type Token } from "@/lib/tokenize";

interface Props {
  articleId: string;
  blocks: Block[];
  initialWords: SavedWordRow[];
  initialSentences: SavedSentenceRow[];
}

interface Active {
  word: string; // normalized; a phrase ("look forward to") when several words are selected
  sentence: string;
  els: HTMLElement[]; // the word spans it covers
}

interface Selection {
  text: string;
  sentence: string;
  phrase: { word: string; els: HTMLElement[] } | null; // set when 2–6 words in one sentence are selected
}

const MAX_PHRASE_WORDS = 6;

const normSentence = (s: string) => s.replace(/\s+/g, " ").trim();

export function Reader({ articleId, blocks, initialWords, initialSentences }: Props) {
  const [words, setWords] = useState(() => new Map(initialWords.map((w) => [w.word, w])));
  const [sentences, setSentences] = useState(() => new Map(initialSentences.map((s) => [s.text, s])));
  const [active, setActive] = useState<Active | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // While a finger/mouse is on the selection bar: a tap there can collapse the text
  // selection on mobile before the button's click fires, which would hide the bar.
  const barPressRef = useRef(false);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  }, []);

  // Highlight the clicked word / its sentence directly in the DOM, so a click doesn't
  // re-render thousands of word spans.
  useEffect(() => {
    if (!active) return;
    const sentenceEl = active.els[0]?.closest(".s");
    active.els.forEach((el) => el.classList.add("active"));
    sentenceEl?.classList.add("active");
    return () => {
      active.els.forEach((el) => el.classList.remove("active"));
      sentenceEl?.classList.remove("active");
    };
  }, [active]);

  // Track text selection (drag to select a passage → save as sentence, or a few words
  // → look up and save as a phrase).
  useEffect(() => {
    const onChange = () => {
      if (barPressRef.current) return;
      const sel = window.getSelection();
      const inside = sel?.anchorNode && containerRef.current?.contains(sel.anchorNode);
      let text = "";
      let phrase: Selection["phrase"] = null;
      let sentence = "";
      if (sel && !sel.isCollapsed && sel.rangeCount) {
        // Snap a selection that starts/ends mid-word ("…a millio") out to whole words.
        const range = sel.getRangeAt(0).cloneRange();
        const [startWord, endWord] = selectedWordBounds(range, containerRef.current);
        if (startWord) range.setStartBefore(startWord);
        if (endWord) range.setEndAfter(endWord);
        text = normSentence(range.toString());
        const sentenceEl = startWord?.closest(".s");
        sentence = normSentence(sentenceEl?.textContent ?? text);
        if (sentenceEl && sentenceEl === endWord?.closest(".s")) {
          const all = [...sentenceEl.querySelectorAll<HTMLElement>(".w")];
          const els = all.slice(all.indexOf(startWord as HTMLElement), all.indexOf(endWord as HTMLElement) + 1);
          const word = normalizePhrase(els.map((el) => el.textContent).join(" "));
          if (els.length >= 2 && els.length <= MAX_PHRASE_WORDS && word.includes(" ")) phrase = { word, els };
        }
      }
      setSelection(inside && text.length > 2 && text.includes(" ") ? { text, sentence, phrase } : null);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActive(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onClick = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return; // finishing a drag-selection, not a click
    const el = (e.target as HTMLElement).closest<HTMLElement>(".w");
    if (!el) {
      setActive(null);
      return;
    }
    const raw = el.textContent ?? "";
    const word = normalizeWord(raw);
    if (!word) return;
    const sentence = normSentence(el.closest(".s")?.textContent ?? raw);
    setActive((prev) => (prev?.els.length === 1 && prev.els[0] === el ? null : { word, sentence, els: [el] }));
  };

  const onError = () => flash("저장하지 못했어요. 다시 시도해주세요");

  const doSaveSentence = async (text: string) => {
    const row = await saveSentence({ articleId, text });
    setSentences((m) => new Map(m).set(row.text, row));
    flash("문장을 저장했어요");
  };

  const doRemoveSentence = async (text: string) => {
    const row = sentences.get(text);
    if (!row) return;
    await removeSentence(row.id);
    setSentences((m) => {
      const next = new Map(m);
      next.delete(text);
      return next;
    });
    flash("문장 저장을 취소했어요");
  };

  return (
    <>
      <div ref={containerRef} onClick={onClick} className="reader font-serif text-[1.15rem] leading-[1.85] sm:text-[1.2rem]">
        <Body blocks={blocks} savedWords={words} savedSentences={sentences} />
      </div>

      <SavedSummary words={[...words.values()]} sentences={[...sentences.values()]} />

      {selection && !active && (
        <SelectionBar
          pressRef={barPressRef}
          text={selection.text}
          saved={sentences.has(selection.text)}
          onError={onError}
          onSave={async () => {
            await doSaveSentence(selection.text);
            window.getSelection()?.removeAllRanges();
            setSelection(null);
          }}
          onOpenPhrase={
            selection.phrase &&
            (() => {
              const { word, els } = selection.phrase!;
              setActive({ word, sentence: selection.sentence, els });
              window.getSelection()?.removeAllRanges();
            })
          }
        />
      )}

      {active && (
        <WordPopover
          key={active.word + active.sentence}
          active={active}
          savedWord={words.get(active.word) ?? null}
          sentenceSaved={sentences.has(active.sentence)}
          onClose={() => setActive(null)}
          onError={onError}
          onSaveWord={async (definition, note) => {
            const row = await saveWord({
              articleId,
              word: active.word,
              context: active.sentence,
              definition: formatDefinition(definition),
              phonetic: definition?.phonetic ?? null,
              note,
            });
            setWords((m) => new Map(m).set(row.word, row));
            flash(`'${row.word}' 단어장에 저장했어요`);
          }}
          onUpdateNote={async (note) => {
            const row = words.get(active.word);
            if (!row) return;
            const updated = await updateWordNote(row.id, note);
            setWords((m) => new Map(m).set(updated.word, updated));
            flash("메모를 저장했어요");
          }}
          onRemoveWord={async () => {
            const row = words.get(active.word);
            if (!row) return;
            await removeWord(row.id);
            setWords((m) => {
              const next = new Map(m);
              next.delete(active.word);
              return next;
            });
            flash(active.word.includes(" ") ? "표현 저장을 취소했어요" : "단어 저장을 취소했어요");
          }}
          onToggleSentence={() =>
            sentences.has(active.sentence) ? doRemoveSentence(active.sentence) : doSaveSentence(active.sentence)
          }
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4">
          <div className="rounded-full bg-ink px-4 py-2 text-sm text-paper shadow-lg">{toast}</div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

const Body = memo(function Body({
  blocks,
  savedWords,
  savedSentences,
}: {
  blocks: Block[];
  savedWords: Map<string, SavedWordRow>;
  savedSentences: Map<string, SavedSentenceRow>;
}) {
  const parsed = useMemo(
    () =>
      blocks.map((b) =>
        b.type === "img" ? b : { ...b, sentences: splitSentences(b.text).map((s) => ({ text: s, tokens: splitWords(s) })) },
      ),
    [blocks],
  );
  const phrases = useMemo(
    () => [...savedWords.keys()].filter((w) => w.includes(" ")).map((w) => w.split(" ")),
    [savedWords],
  );

  return (
    <>
      {parsed.map((b, i) => {
        if (b.type === "img") {
          return (
            <figure key={i} className="my-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.src} alt={b.caption ?? ""} loading="lazy" className="w-full rounded-lg" />
              {b.caption && <figcaption className="mt-2 font-sans text-xs text-muted">{b.caption}</figcaption>}
            </figure>
          );
        }
        const content = b.sentences.map((s, si) => {
          const inPhrase = phraseTokens(s.tokens, phrases);
          return (
            <span key={si}>
              <span className={`s${savedSentences.has(normSentence(s.text)) ? " saved" : ""}`}>
                {s.tokens.map((t, ti) =>
                  t.word ? (
                    <span key={ti} className={`w${inPhrase.has(ti) || savedWords.has(normalizeWord(t.text)) ? " saved" : ""}`}>
                      {t.text}
                    </span>
                  ) : (
                    t.text
                  ),
                )}
              </span>
              {si < b.sentences.length - 1 ? " " : null}
            </span>
          );
        });
        if (b.type === "h") return <h2 key={i} className="mt-10 mb-4 text-[1.35rem] leading-snug font-semibold">{content}</h2>;
        if (b.type === "quote")
          return (
            <blockquote key={i} className="my-6 border-l-2 border-accent pl-5 italic text-ink/85">
              {content}
            </blockquote>
          );
        if (b.type === "li")
          return (
            <p key={i} className="my-3 pl-5 -indent-4">
              <span className="mr-2 text-accent">•</span>
              {content}
            </p>
          );
        return (
          <p key={i} className="my-5">
            {content}
          </p>
        );
      })}
    </>
  );
});

// First and last word spans the selection actually covers. Mobile selection handles
// often put the range boundaries in the space between words, on a sentence/paragraph
// element, or at offset 0 of the following word — so look at overlap, not the boundary nodes.
function selectedWordBounds(range: Range, container: HTMLElement | null): [HTMLElement | null, HTMLElement | null] {
  if (!container) return [null, null];
  const common = range.commonAncestorContainer;
  const commonEl = common.nodeType === Node.ELEMENT_NODE ? (common as Element) : common.parentElement;
  const ownWord = commonEl?.closest<HTMLElement>(".w");
  if (ownWord) return [ownWord, ownWord];
  const scope = commonEl && container.contains(commonEl) ? commonEl : container;
  const all = [...scope.querySelectorAll<HTMLElement>(".w")];
  const wr = document.createRange();
  const overlaps = (w: HTMLElement) => {
    wr.selectNodeContents(w);
    // range.end > word.start && range.start < word.end
    return range.compareBoundaryPoints(Range.START_TO_END, wr) > 0 && range.compareBoundaryPoints(Range.END_TO_START, wr) < 0;
  };
  const first = all.find(overlaps) ?? null;
  return [first, first && (all.findLast(overlaps) ?? null)];
}

// Indexes of word tokens that belong to an occurrence of a saved phrase.
function phraseTokens(tokens: Token[], phrases: string[][]): Set<number> {
  const out = new Set<number>();
  if (!phrases.length) return out;
  const idx = tokens.flatMap((t, i) => (t.word ? [i] : []));
  const norm = idx.map((i) => normalizeWord(tokens[i].text));
  for (const p of phrases) {
    for (let start = 0; start + p.length <= norm.length; start++) {
      if (p.every((w, k) => norm[start + k] === w)) p.forEach((_, k) => out.add(idx[start + k]));
    }
  }
  return out;
}

function WordPopover({
  active,
  savedWord,
  sentenceSaved,
  onClose,
  onSaveWord,
  onUpdateNote,
  onRemoveWord,
  onToggleSentence,
  onError,
}: {
  active: Active;
  savedWord: SavedWordRow | null;
  sentenceSaved: boolean;
  onClose: () => void;
  onSaveWord: (d: Definition | null, note: string) => Promise<void>;
  onUpdateNote: (note: string) => Promise<void>;
  onRemoveWord: () => Promise<void>;
  onToggleSentence: () => Promise<void>;
  onError: () => void;
}) {
  const [def, setDef] = useState<Definition | null | undefined>(undefined);
  const [note, setNote] = useState(savedWord?.note ?? "");
  const [pending, start] = useTransition();
  const noteChanged = note.trim() !== (savedWord?.note ?? "");

  useEffect(() => {
    let cancelled = false;
    lookup(active.word).then((d) => !cancelled && setDef(d));
    return () => {
      cancelled = true;
    };
  }, [active.word]);

  const run = (fn: () => Promise<void>) => start(() => fn().catch(onError));
  const kind = active.word.includes(" ") ? "표현" : "단어";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:pb-6" role="dialog" aria-label={`${kind} ${active.word}`}>
      <div className="w-full max-w-xl rounded-2xl border border-line bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-3">
              <span className="font-serif text-2xl font-semibold">{active.word}</span>
              {def?.phonetic && <span className="text-sm text-muted">{def.phonetic}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="-m-2 p-2 text-muted hover:text-ink" aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="mt-2 max-h-36 overflow-y-auto text-sm">
          {def === undefined && <p className="text-muted">뜻을 찾는 중…</p>}
          {def === null && <p className="text-muted">영영사전에서 뜻을 찾지 못했어요. 네이버 사전에서 확인해보세요.</p>}
          {def?.meanings.map((m, i) => (
            <p key={i} className="mb-1">
              <span className="mr-1.5 text-xs italic text-muted">{m.partOfSpeech}</span>
              {m.definition}
            </p>
          ))}
        </div>

        <p className="mt-3 line-clamp-3 rounded-lg bg-paper px-3 py-2 font-serif text-sm leading-relaxed text-ink/80">
          {active.sentence}
        </p>

        <div className="mt-3 flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && savedWord && noteChanged && !pending) run(() => onUpdateNote(note));
            }}
            placeholder="메모 (뜻, 쓰임새 등)"
            className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink/40"
          />
          {savedWord && noteChanged && (
            <button type="button" disabled={pending} onClick={() => run(() => onUpdateNote(note))} className={btn("secondary")}>
              메모 저장
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {savedWord ? (
            <button type="button" disabled={pending} onClick={() => run(onRemoveWord)} className={btn("secondary")}>
              ✓ {kind} 저장됨 · 취소
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || def === undefined}
              onClick={() => run(() => onSaveWord(def ?? null, note))}
              className={btn("primary")}
            >
              {kind} 저장
            </button>
          )}
          <button type="button" disabled={pending} onClick={() => run(onToggleSentence)} className={btn("secondary")}>
            {sentenceSaved ? "✓ 문장 저장됨 · 취소" : "이 문장 저장"}
          </button>
          <a href={naverDictUrl(active.word)} target="_blank" rel="noreferrer" className={btn("ghost")}>
            네이버 사전 ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function SelectionBar({
  pressRef,
  text,
  saved,
  onSave,
  onOpenPhrase,
  onError,
}: {
  pressRef: React.RefObject<boolean>;
  text: string;
  saved: boolean;
  onSave: () => Promise<void>;
  onOpenPhrase: (() => void) | null;
  onError: () => void;
}) {
  const [pending, start] = useTransition();
  useEffect(() => () => void (pressRef.current = false), [pressRef]);
  const release = () => window.setTimeout(() => (pressRef.current = false), 300);
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:pb-6"
      onPointerDown={() => (pressRef.current = true)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-line bg-card p-3 pl-4 shadow-2xl sm:flex-row sm:items-center">
        <p className="line-clamp-2 min-w-0 flex-1 font-serif text-sm text-ink/80">{text}</p>
        <div className="flex shrink-0 justify-end gap-2">
          {onOpenPhrase && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onOpenPhrase} className={btn("primary")}>
              표현 뜻 보기
            </button>
          )}
          <button
            type="button"
            // Keep the selection alive while pressing the button.
            onMouseDown={(e) => e.preventDefault()}
            disabled={pending || saved}
            onClick={() => start(() => onSave().catch(onError))}
            className={btn(onOpenPhrase ? "secondary" : "primary")}
          >
            {saved ? "저장됨" : pending ? "저장 중…" : onOpenPhrase ? "문장으로 저장" : "선택한 문장 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SavedSummary({ words, sentences }: { words: SavedWordRow[]; sentences: SavedSentenceRow[] }) {
  if (!words.length && !sentences.length) {
    return (
      <p className="mt-16 rounded-xl border border-dashed border-line p-5 text-center text-sm text-muted">
        단어를 누르면 뜻을 보고 단어장에 저장할 수 있어요. 구동사처럼 여러 단어로 된 표현은 드래그해서 선택한 뒤 &lsquo;표현 뜻 보기&rsquo;를 누르세요. 문장은 단어를 누른 뒤 &lsquo;이 문장 저장&rsquo;을 누르거나, 드래그해서 선택하면 저장할 수 있어요.
      </p>
    );
  }
  return (
    <section className="mt-16 rounded-2xl border border-line bg-card p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted">이 글에서 저장한 것</h2>
      {words.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {words.map((w) => (
            <span key={w.id} className="rounded-full bg-word-mark px-3 py-1 font-serif text-sm">
              {w.word}
            </span>
          ))}
        </div>
      )}
      {sentences.length > 0 && (
        <ul className="mt-4 space-y-2">
          {sentences.map((s) => (
            <li key={s.id} className="rounded-lg bg-sentence-mark px-3 py-2 font-serif text-sm leading-relaxed">
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function btn(kind: "primary" | "secondary" | "ghost") {
  const base = "rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap";
  if (kind === "primary") return `${base} bg-accent text-white hover:opacity-90`;
  if (kind === "secondary") return `${base} border border-line hover:border-ink/40`;
  return `${base} text-muted hover:text-ink`;
}

