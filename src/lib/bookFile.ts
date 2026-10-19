import { strFromU8, unzipSync } from "fflate";
import { blocksToText, htmlToBlocks } from "./bookHtml";

// Converts an EPUB or PDF file to plain text in the browser (paragraphs separated by
// blank lines), so a large file never has to be uploaded: only its text is sent.

export interface BookFile {
  format: "txt" | "epub" | "pdf";
  title: string | null;
  author: string | null;
  text: string;
}

export async function readBookFile(file: File): Promise<BookFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".epub") || file.type === "application/epub+zip") return readEpub(file);
  if (name.endsWith(".pdf") || file.type === "application/pdf") return readPdf(file);
  return { format: "txt", title: null, author: null, text: await file.text() };
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim() || null;

// ---- EPUB ----
// A zip of XHTML chapters; META-INF/container.xml points to the package file, whose
// spine lists the chapters in reading order.

const DC = "http://purl.org/dc/elements/1.1/";

function parseXml(source: string, type: DOMParserSupportedType = "application/xhtml+xml") {
  const doc = new DOMParser().parseFromString(source, type);
  // Not every EPUB is well-formed XHTML; the HTML parser is forgiving.
  return doc.querySelector("parsererror") && type !== "text/html" ? new DOMParser().parseFromString(source, "text/html") : doc;
}

// "OEBPS/text/" + "../images/a.xhtml" → "OEBPS/images/a.xhtml"
function resolvePath(base: string, href: string) {
  const parts = (base + href).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== ".") out.push(p);
  }
  return out.join("/");
}

async function readEpub(file: File): Promise<BookFile> {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error("EPUB 파일을 열 수 없어요");
  }
  const read = (path: string) => (zip[path] ? strFromU8(zip[path]) : null);

  const container = read("META-INF/container.xml");
  const opfPath = container && parseXml(container, "application/xml").querySelector("rootfile")?.getAttribute("full-path");
  const opfSource = opfPath && read(opfPath);
  if (!opfPath || !opfSource) throw new Error("EPUB 파일을 열 수 없어요");
  const opf = parseXml(opfSource, "application/xml");
  const base = opfPath.includes("/") ? opfPath.replace(/[^/]*$/, "") : "";

  const manifest = new Map(
    [...opf.querySelectorAll("manifest > item")].map((item) => [
      item.getAttribute("id"),
      {
        path: resolvePath(base, decodeURIComponent(item.getAttribute("href") ?? "")),
        type: item.getAttribute("media-type") ?? "",
        nav: /\bnav\b/.test(item.getAttribute("properties") ?? ""),
      },
    ]),
  );

  // DRM encrypts the chapters themselves (font obfuscation only touches fonts).
  const encryption = read("META-INF/encryption.xml");
  if (encryption && /URI="[^"]+\.x?html?"/i.test(encryption)) throw new Error("DRM이 걸린 책이라 읽을 수 없어요");

  const blocks = [...opf.querySelectorAll("spine > itemref")].flatMap((ref) => {
    if (ref.getAttribute("linear") === "no") return [];
    const item = manifest.get(ref.getAttribute("idref"));
    if (!item || item.nav || !/html/.test(item.type)) return [];
    const source = read(item.path);
    if (!source) return [];
    const doc = parseXml(source);
    return htmlToBlocks(doc.body ?? doc.documentElement);
  });

  const meta = (tag: string) => clean(opf.getElementsByTagNameNS(DC, tag)[0]?.textContent);
  const authors = [...opf.getElementsByTagNameNS(DC, "creator")].map((c) => clean(c.textContent)).filter(Boolean);
  return { format: "epub", title: meta("title"), author: authors.join(", ") || null, text: blocksToText(blocks) };
}

// ---- PDF ----
// PDF text is positioned fragments, not paragraphs: fragments are joined into lines,
// and a new paragraph starts at a bigger gap between lines or an indented first line.

interface Line {
  text: string;
  x: number;
  y: number;
  h: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

// The book title / chapter name repeated at the top or bottom of every page.
const furnitureKey = (s: string) => s.toLowerCase().replace(/[\divxlc]+\b/g, "").replace(/\W+/g, "");

function joinWrapped(lines: string[]): string {
  let out = "";
  for (const line of lines) {
    if (/[a-z]-$/.test(out) && /^[a-z]/.test(line)) out = out.slice(0, -1) + line;
    else out = out ? `${out} ${line}` : line;
  }
  return out;
}

// A chapter's big first letter is a line of its own, and the lines beside it are
// indented: "M" / "r. Bennet was among the earliest" / "on Mr. Bingley. He had…"
function joinDropCaps(lines: Line[]): Line[] {
  const out: Line[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cap = lines[i];
    const next = lines[i + 1];
    if (/^[A-Z]$/.test(cap.text) && next && next.x > cap.x) {
      const besideX = next.x;
      out.push({ ...next, text: cap.text + next.text, x: cap.x });
      i++;
      while (lines[i + 1] && Math.abs(lines[i + 1].x - besideX) < 2) out.push({ ...lines[++i], x: cap.x });
    } else out.push(cap);
  }
  return out;
}

async function readPdf(file: File): Promise<BookFile> {
  const { getDocumentProxy } = await import("unpdf");
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    throw new Error(e instanceof Error && e.name === "PasswordException" ? "암호가 걸린 PDF예요" : "PDF 파일을 열 수 없어요");
  }

  const pages: Line[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const lines: Line[] = [];
    let cur: Line | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const [, , , , x, y] = item.transform as number[];
      const h = item.height || Math.abs((item.transform as number[])[3]) || 10;
      if (cur && Math.abs(cur.y - y) > h * 0.5) {
        lines.push(cur);
        cur = null;
      }
      if (!cur) cur = { text: "", x, y, h };
      cur.text += item.str;
      if (item.hasEOL) {
        lines.push(cur);
        cur = null;
      }
    }
    if (cur) lines.push(cur);
    pages.push(
      joinDropCaps(lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() })).filter((l) => l.text)).filter(
        (l) => !/^([\divxlc]+|- ?\d+ ?-)$/i.test(l.text), // page numbers
      ),
    );
    page.cleanup();
  }

  // Running heads: a first/last line that recurs on many pages.
  const counts = new Map<string, number>();
  for (const lines of pages) {
    for (const l of new Set([lines[0], lines.at(-1)])) {
      const key = l && furnitureKey(l.text);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const isFurniture = (l: Line) => {
    const c = counts.get(furnitureKey(l.text)) ?? 0;
    return c >= 3 && c >= pages.length * 0.15;
  };

  const paragraphs: string[] = [];
  for (const lines of pages) {
    const body = lines.filter((l, i) => !((i === 0 || i === lines.length - 1) && isFurniture(l)));
    if (!body.length) continue;
    const gaps = body.slice(1).map((l, i) => body[i].y - l.y).filter((g) => g > 0);
    const spacing = median(gaps) || body[0].h * 1.2;
    const left = median(body.map((l) => l.x).filter((x) => x <= median(body.map((b) => b.x))));
    const indented = (l: Line) => l.x > left + l.h * 0.8;
    const isChapter = (l: Line) => l.text.length < 40 && /^(chapter|part|book|volume)\s+\S+$/i.test(l.text);
    // A paragraph that runs over from the previous page (it stopped mid-sentence and
    // this page doesn't start with an indent) continues it.
    const last = paragraphs.at(-1);
    let para: string[] = last && !/[.!?"”’':)]$/.test(last) && !indented(body[0]) ? [paragraphs.pop()!] : [];
    body.forEach((l, i) => {
      const prev = body[i - 1];
      const gap = prev ? prev.y - l.y : 0;
      if (prev && (gap > spacing * 1.4 || gap < 0 || indented(l) || isChapter(l) || isChapter(prev)) && para.length) {
        paragraphs.push(joinWrapped(para));
        para = [];
      }
      para.push(l.text);
    });
    if (para.length) paragraphs.push(joinWrapped(para));
  }
  if (paragraphs.join(" ").split(/\s+/).length < 30) {
    throw new Error("글자를 읽을 수 없는 PDF예요 (스캔한 이미지만 들어 있어요)");
  }

  const info = (await pdf.getMetadata().catch(() => null))?.info as { Title?: string; Author?: string } | undefined;
  // Word processors leave titles like "Microsoft Word - draft3.docx".
  const title = clean(info?.Title);
  return {
    format: "pdf",
    title: title && !/\.(docx?|pdf|indd)$|^microsoft/i.test(title) ? title : null,
    author: clean(info?.Author),
    text: paragraphs.join("\n\n"),
  };
}
