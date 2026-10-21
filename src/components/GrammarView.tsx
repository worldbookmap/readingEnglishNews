import type { Grammar } from "@/lib/grammar";

// A sentence's grammar analysis: shown in the reader's 문법 분석 panel and on saved sentences.
export function GrammarView({ grammar }: { grammar: Grammar }) {
  return (
    <>
      <p className="leading-relaxed">{grammar.translation}</p>
      <p className="mt-3 inline-block rounded-lg bg-paper px-3 py-1.5 font-mono text-xs">{grammar.pattern}</p>

      <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted">끊어 읽기</h3>
      <ol className="space-y-2">
        {grammar.chunks.map((c, i) => (
          <li key={i} className="rounded-lg bg-paper px-3 py-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-serif text-[0.95rem]">{c.text}</span>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">{c.role}</span>
            </div>
            {c.note && <p className="mt-1 text-xs leading-relaxed text-muted">{c.note}</p>}
          </li>
        ))}
      </ol>

      {grammar.points.length > 0 && (
        <>
          <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted">문법 포인트</h3>
          <ul className="space-y-2">
            {grammar.points.map((p, i) => (
              <li key={i}>
                <p className="font-medium">{p.title}</p>
                <p className="mt-0.5 leading-relaxed text-ink/80">{p.explanation}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
