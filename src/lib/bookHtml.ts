import type { Block, Mark } from "./extract";

// Book HTML (EPUB chapters, Standard Ebooks' single-page edition) → blocks. Works on
// the browser DOM and on linkedom's, so it's shared by the EPUB upload (in the browser)
// and the Standard Ebooks import (on the server).

// Standard Ebooks puts invisible word joiners (U+2060) around dashes and ellipses.
const INVISIBLE = /[\u2060\u200b\u00ad]/g;
const clean = (s: string | null | undefined) => (s ?? "").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
const epubType = (el: Element) => el.getAttribute("epub:type") ?? "";

export function htmlToBlocks(root: ParentNode, options: HtmlToBlocksOptions = {}): Block[] {
  // Footnote markers would otherwise stick to the word before them ("house1").
  for (const a of root.querySelectorAll("a, sup")) {
    if (/noteref/.test(epubType(a)) || (a.tagName.toLowerCase() === "sup" && /^\W*\d+\W*$/.test(a.textContent ?? ""))) a.remove();
  }
  // A drop cap or a capital before small caps is a letter in its own element, often
  // followed by a line break in the source: "<span class="dropcap">W</span>\n hy" would
  // read "W hy". ("SCAP" itself is small caps, whose words keep their spaces.)
  for (const el of root.querySelectorAll("[class]")) {
    if (!/drop|(^|[\s_-])cap([\s_-]|$)/i.test(el.getAttribute("class") ?? "")) continue;
    if (!/^\s*[“"‘'—]?\p{Lu}\s*$/u.test(el.textContent ?? "")) continue;
    el.textContent = (el.textContent ?? "").trim();
    // The text after it, possibly outside a wrapping element: drop the whitespace up to it.
    let n: Node | null = el;
    while (n) {
      while (n && n !== root && !n.nextSibling) n = n.parentNode;
      if (!n || n === root) break;
      n = n.nextSibling!;
      while (n.firstChild) n = n.firstChild;
      if (n.nodeType === 3 && (n.textContent = (n.textContent ?? "").replace(/^\s+/, ""))) break;
    }
  }
  const blocks: Block[] = [];
  for (const el of root.querySelectorAll("p, h1, h2, h3, h4, h5, h6, blockquote, li, img, image")) {
    const tag = el.tagName.toLowerCase();
    if (tag === "img" || tag === "image") {
      const href = el.getAttribute("src") ?? el.getAttribute("href") ?? el.getAttribute("xlink:href") ?? el.getAttributeNS?.(XLINK, "href");
      const src = href && options.image?.(href);
      if (!src) continue;
      // A <figcaption> with paragraphs in it is read as text anyway.
      const caption = el.closest("figure")?.querySelector("figcaption");
      const captionText = caption && !caption.querySelector("p, div") ? clean(caption.textContent) : "";
      if (blocks.at(-1)?.type === "img" && (blocks.at(-1) as { src: string }).src === src) continue;
      blocks.push({ type: "img", src, ...(captionText ? { caption: captionText } : {}) });
      continue;
    }
    // A <p> inside a <blockquote>/<li> is part of its parent's text.
    if (tag === "p" && el.parentElement?.closest("blockquote, li")) continue;
    // Nested lists are read with their parent item.
    if (tag === "li" && el.parentElement?.closest("li")) continue;
    // Poetry and letters put each line in its own <span> separated by <br/>.
    for (const br of el.querySelectorAll("br")) br.replaceWith(" ");
    const { text, marks } = inlineText(el, options.classStyles);
    if (!text) continue;
    // An <hgroup> holds a chapter number and its title ("XII" / "The Ball").
    const heading = tag.startsWith("h") || el.parentElement?.tagName.toLowerCase() === "hgroup";
    blocks.push({
      type: heading ? "h" : tag === "blockquote" ? "quote" : tag === "li" ? "li" : "p",
      text,
      ...(marks.length && !heading ? { marks } : {}),
    });
  }
  return blocks;
}

// ---- Bold and italic ----

export type ClassStyles = Map<string, { bold?: boolean; italic?: boolean }>;

export interface HtmlToBlocksOptions {
  // Classes the book's stylesheet makes bold or italic (or upright again).
  classStyles?: ClassStyles;
  // An image's src → the image block's src; null skips it. Without it, images are skipped.
  image?: (src: string) => string | null;
}

const XLINK = "http://www.w3.org/1999/xlink";
const BOLD_TAGS = new Set(["b", "strong"]);
const ITALIC_TAGS = new Set(["i", "em", "cite", "dfn", "var"]);

const fontWeight = (v: string | undefined) =>
  v === undefined ? undefined : /^(bold|bolder|[6-9]00)$/i.test(v) ? true : /^(normal|lighter|[1-5]00)$/i.test(v) ? false : undefined;
const fontStyle = (v: string | undefined) =>
  v === undefined ? undefined : /^(italic|oblique)$/i.test(v) ? true : /^normal$/i.test(v) ? false : undefined;

// Whether an element turns bold/italic on (true), off (false) or leaves it as it is.
function elementStyle(el: Element, classStyles?: ClassStyles) {
  const tag = el.tagName.toLowerCase().replace(/^.*:/, "");
  let bold: boolean | undefined = BOLD_TAGS.has(tag) || undefined;
  let italic: boolean | undefined = ITALIC_TAGS.has(tag) || undefined;
  for (const c of (el.getAttribute("class") ?? "").split(/\s+/)) {
    const s = c && classStyles?.get(c);
    if (s) {
      bold = s.bold ?? bold;
      italic = s.italic ?? italic;
    }
  }
  const style = el.getAttribute("style") ?? "";
  bold = fontWeight(/font-weight\s*:\s*([a-z0-9]+)/i.exec(style)?.[1]) ?? bold;
  italic = fontStyle(/font-style\s*:\s*([a-z]+)/i.exec(style)?.[1]) ?? italic;
  return { bold, italic };
}

// The `font-weight` / `font-style` of simple class rules (".italic", "span.bold") in a stylesheet.
export function cssClassStyles(css: string, into: ClassStyles = new Map()): ClassStyles {
  for (const [, selectors, body] of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
    const bold = fontWeight(/font-weight\s*:\s*([a-z0-9]+)/i.exec(body)?.[1]);
    const italic = fontStyle(/font-style\s*:\s*([a-z]+)/i.exec(body)?.[1]);
    if (bold === undefined && italic === undefined) continue;
    for (const sel of selectors.split(",")) {
      const cls = /^[a-z0-9]*\.([\w-]+)$/i.exec(sel.trim())?.[1];
      if (!cls) continue;
      const s = into.get(cls) ?? {};
      into.set(cls, { bold: bold ?? s.bold, italic: italic ?? s.italic });
    }
  }
  return into;
}

// An element's text, whitespace collapsed as `clean` does, with its bold/italic runs.
function inlineText(el: Element, classStyles?: ClassStyles): { text: string; marks: Mark[] } {
  const runs: { text: string; bold: boolean; italic: boolean }[] = [];
  const walk = (node: Element, bold: boolean, italic: boolean) => {
    const s = elementStyle(node, classStyles);
    bold = s.bold ?? bold;
    italic = s.italic ?? italic;
    for (const child of node.childNodes) {
      if (child.nodeType === 3) runs.push({ text: child.textContent ?? "", bold, italic });
      else if (child.nodeType === 1) walk(child as Element, bold, italic);
    }
  };
  walk(el, false, false);

  let text = "";
  const marks: Mark[] = [];
  for (const run of runs) {
    let t = run.text.replace(INVISIBLE, "").replace(/\s+/g, " ");
    if (t.startsWith(" ") && (!text || text.endsWith(" "))) t = t.slice(1);
    if (!t) continue;
    let start = text.length;
    text += t;
    if (!run.bold && !run.italic) continue;
    let end = text.length;
    while (start < end && text[start] === " ") start++;
    while (end > start && text[end - 1] === " ") end--;
    if (start === end) continue;
    const last = marks.at(-1);
    if (last && !!last.bold === run.bold && !!last.italic === run.italic && !text.slice(last.end, start).trim()) last.end = end;
    else marks.push({ start, end, ...(run.bold ? { bold: true } : {}), ...(run.italic ? { italic: true } : {}) });
  }
  return { text: text.replace(/ $/, ""), marks };
}

export const blocksToText = (blocks: Block[]) =>
  blocks
    .flatMap((b) => (b.type === "img" ? [] : [b.text]))
    .join("\n\n");
