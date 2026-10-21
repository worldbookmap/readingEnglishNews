import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Grammar analysis of a dragged sentence, written in Korean by Claude. Results are cached
// in grammar_analyses (see analyzeGrammar in actions.ts).

const GrammarSchema = z.object({
  translation: z.string(), // natural Korean translation
  pattern: z.string(), // "S + V + O + to부정사"
  chunks: z.array(
    z.object({
      text: z.string(), // the chunk, copied from the sentence
      role: z.string(), // 주어, 동사, 목적어, 관계절, 분사구 …
      note: z.string(),
    }),
  ),
  points: z.array(z.object({ title: z.string(), explanation: z.string() })),
});

export type Grammar = z.infer<typeof GrammarSchema>;

export const GRAMMAR_MODEL = "claude-haiku-5-5";
export const MAX_GRAMMAR_CHARS = 600;

const SYSTEM = `You are an English grammar tutor for a Korean learner reading English news and books.
The user sends an English sentence (or a short passage). Analyze it and write every explanation in Korean.

- translation: a natural Korean translation.
- pattern: the sentence's skeleton, e.g. "S + V + O + to부정사" or "주절 + 관계대명사절". For a passage, the main sentence's.
- chunks: split the text into meaning units in reading order (끊어 읽기). Copy each chunk's text exactly from the sentence, covering the whole sentence. Give its grammatical role in Korean (주어, 동사, 목적어, 보어, 관계절, 분사구, 전치사구, 부사절 …) and a short note on what it modifies or how it works.
- points: 2–4 things a learner would find tricky here (clause structure, tense/aspect, participles, inversion, ellipsis, idioms, phrasal verbs), each with a short title and a clear explanation that quotes the relevant words.

Be concise and concrete; don't explain trivial things.`;

let client: Anthropic | null = null;

export async function analyze(sentence: string): Promise<Grammar> {
  client ??= new Anthropic();
  const res = await client.messages.parse({
    model: GRAMMAR_MODEL,
    max_tokens: 8000,
    output_config: { format: zodOutputFormat(GrammarSchema), effort: "low" },
    system: SYSTEM,
    messages: [{ role: "user", content: sentence }],
  });
  if (!res.parsed_output) throw new Error(`grammar analysis failed: ${res.stop_reason}`);
  return res.parsed_output;
}
