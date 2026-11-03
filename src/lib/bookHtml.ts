import type { Block } from "./extract";

// Book HTML (EPUB chapters, Standard Ebooks' single-page edition) → blocks. Works on
// the browser DOM and on linkedom's, so it's shared by the EPUB upload (in the browser)
// and the Standard Ebooks import (on the server).

// Standard Ebooks puts invisible word joiners (U+2060) around dashes and ellipses.
const clean = (s: string | null | undefined) =>
  (s ?? "").replace(/[\u2060\u200b\u00ad]/g, "").replace(/\s+/g, " ").trim();
const epubType = (el: Element) => el.getAttribute("epub:type") ?? "";

export function htmlToBlocks(root: ParentNode): Block[] {
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
  for (const el of root.querySelectorAll("p, h1, h2, h3, h4, h5, h6, blockquote, li")) {
    const tag = el.tagName.toLowerCase();
    // A <p> inside a <blockquote>/<li> is part of its parent's text.
    if (tag === "p" && el.parentElement?.closest("blockquote, li")) continue;
    // Nested lists are read with their parent item.
    if (tag === "li" && el.parentElement?.closest("li")) continue;
    // Poetry and letters put each line in its own <span> separated by <br/>.
    for (const br of el.querySelectorAll("br")) br.replaceWith(" ");
    const text = clean(el.textContent);
    if (!text) continue;
    // An <hgroup> holds a chapter number and its title ("XII" / "The Ball").
    const heading = tag.startsWith("h") || el.parentElement?.tagName.toLowerCase() === "hgroup";
    blocks.push({ type: heading ? "h" : tag === "blockquote" ? "quote" : tag === "li" ? "li" : "p", text });
  }
  return blocks;
}

export const blocksToText = (blocks: Block[]) =>
  blocks
    .flatMap((b) => (b.type === "img" ? [] : [b.text]))
    .join("\n\n");
