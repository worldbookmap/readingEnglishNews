import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveDocTranslations } from "@/lib/translations";

// The 번역 노트 Chrome extension posts a document's translations here from the book page
// it's open on (same origin, so the login cookie comes along; proxy.ts checks it).

const bodySchema = z.object({
  url: z.string().url().max(2000),
  pairs: z
    .array(z.object({ key: z.string().max(100), source: z.string().max(50_000), translation: z.string().max(50_000) }))
    .max(20_000),
  keys: z.array(z.string().max(100)).max(50_000),
});

export async function POST(request: Request) {
  // A JSON body can't be sent cross-site without a CORS preflight, which this route doesn't answer.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "expected JSON" }, { status: 415 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
  const result = await saveDocTranslations(parsed.data);
  revalidatePath("/books", "layout");
  return Response.json({ ok: true, ...result });
}
