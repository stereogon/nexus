/**
 * What was copied from a web page or a document, as Markdown (2026-11-09): headings,
 * paragraphs, bold, italic, struck-through and code words, code blocks, links, lists
 * (nested, and to-dos), quotes, dividers and tables. Pasting from the web or Google Docs
 * gave plain text before, the formatting lost, where Notion keeps it.
 *
 * Written here rather than taken from a library: the subset the notes can hold is small,
 * and the HTML is only read, never shown. It is parsed by the browser's DOMParser, which
 * runs nothing in it, and a link keeps its address only when that is a web or mail one.
 * Images are left out: a picture on someone's server would not load offline.
 */
import { writeTable } from "./tableModel";

const BLOCKS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "DL", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6",
  "HEADER", "HR", "LI", "MAIN", "OL", "P", "PRE", "SECTION", "TABLE", "UL",
]);

const isBlock = (node: Node): node is HTMLElement => node instanceof HTMLElement && BLOCKS.has(node.tagName);

/** Holds blocks: a container whose children are walked as blocks, not as words. */
const holdsBlocks = (element: HTMLElement) => [...element.childNodes].some(isBlock);

/** `text` between `marker`s, the spaces at its ends kept outside so the marks still work. */
function wrap(text: string, marker: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/u.exec(text);
  const inner = match?.[2] ?? "";

  return inner === "" ? text : `${match?.[1] ?? ""}${marker}${inner}${marker}${match?.[3] ?? ""}`;
}

function styled(element: HTMLElement): { bold: boolean; italic: boolean; struck: boolean } {
  const style = element.style;
  const weight = style.fontWeight;
  const tag = element.tagName;
  // Google Docs wraps a whole copy in <b style="font-weight:normal">, and marks real bold
  // with a style instead.
  const bold = weight === "" ? tag === "B" || tag === "STRONG" : weight === "bold" || Number(weight) >= 600;

  return {
    bold,
    italic: tag === "EM" || tag === "I" || style.fontStyle === "italic",
    struck: tag === "S" || tag === "DEL" || tag === "STRIKE" || style.textDecoration.includes("line-through"),
  };
}

/** A run of words, with their formatting as marks. */
function inline(node: Node, inCode = false): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").replace(/\s+/gu, " ");
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  const inner = () => [...node.childNodes].map((child) => inline(child, inCode)).join("");

  switch (node.tagName) {
    case "BR":
      return "\n";
    case "IMG":
    case "SCRIPT":
    case "STYLE":
      return "";
    case "CODE":
      return inCode ? node.textContent : wrap(node.textContent, "`");
    case "A": {
      const href = node.getAttribute("href") ?? "";
      const words = inner();

      return /^(https?:|mailto:)/iu.test(href) && words.trim() !== "" ? `[${words.trim()}](${href})` : words;
    }
    default: {
      const { bold, italic, struck } = styled(node);
      let text = inner();

      text = struck ? wrap(text, "~~") : text;
      text = italic ? wrap(text, "_") : text;
      return bold ? wrap(text, "**") : text;
    }
  }
}

/** Words tidied: runs of spaces, left where a dropped image or tag was, made one. */
const tidy = (text: string) => text.replace(/[ \t]{2,}/gu, " ").trim();

/** A cell's words, on one line, for a GFM table. */
const cellText = (cell: Element) => tidy(inline(cell).replace(/\s*\n\s*/gu, " "));

function table(element: HTMLElement): string {
  const rows = [...element.querySelectorAll("tr")].map((row) => [...row.querySelectorAll("th, td")].map(cellText));
  const width = Math.max(0, ...rows.map((row) => row.length));
  const [header, ...body] = rows.map((row) => Array.from({ length: width }, (_, at) => row[at] ?? ""));

  return header === undefined || width === 0
    ? ""
    : writeTable({ header, align: header.map(() => null), rows: body });
}

/** A list's items, each line indented by `indent`, nested lists under their item. */
function list(element: HTMLElement, indent: string): string {
  const ordered = element.tagName === "OL";
  const items = [...element.children].filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName === "LI");

  return items
    .map((item, at) => {
      const box = item.querySelector(':scope > input[type="checkbox"]');
      const marker = ordered ? `${String(at + 1)}. ` : box instanceof HTMLInputElement ? `- [${box.checked ? "x" : " "}] ` : "- ";
      const words = [...item.childNodes]
        .filter((child) => !(child instanceof HTMLElement && (child.tagName === "UL" || child.tagName === "OL")))
        .map((child) => inline(child))
        .join("");
      const nested = [...item.children]
        .filter((child): child is HTMLElement => child instanceof HTMLElement && (child.tagName === "UL" || child.tagName === "OL"))
        .map((child) => list(child, indent + " ".repeat(marker.replace(/\[.\] $/u, "").length)));

      return [`${indent}${marker}${tidy(words)}`, ...nested].join("\n");
    })
    .join("\n");
}

/** The blocks in `container`, each as Markdown; words between blocks make a paragraph. */
function blocks(container: HTMLElement): string[] {
  const out: string[] = [];
  let words = "";
  const flush = () => {
    if (words.trim() !== "") {
      out.push(tidy(words));
    }
    words = "";
  };

  for (const child of container.childNodes) {
    if (!(child instanceof HTMLElement) || (!isBlock(child) && !holdsBlocks(child))) {
      words += inline(child);
      continue;
    }

    flush();

    const tag = child.tagName;
    const level = /^H([1-6])$/u.exec(tag)?.[1];

    if (level !== undefined) {
      out.push(`${"#".repeat(Number(level))} ${tidy(inline(child))}`);
    } else if (tag === "UL" || tag === "OL") {
      out.push(list(child, ""));
    } else if (tag === "PRE") {
      const language = /language-([\w+#-]+)/u.exec(`${child.className} ${child.querySelector("code")?.className ?? ""}`)?.[1] ?? "";

      out.push(`\`\`\`${language}\n${child.textContent.replace(/\n$/u, "")}\n\`\`\``);
    } else if (tag === "BLOCKQUOTE") {
      out.push(blocks(child).join("\n\n").split("\n").map((text) => `> ${text}`.trimEnd()).join("\n"));
    } else if (tag === "HR") {
      out.push("---");
    } else if (tag === "TABLE") {
      out.push(table(child));
    } else if (holdsBlocks(child)) {
      out.push(...blocks(child));
    } else {
      out.push(tidy(inline(child)));
    }
  }

  flush();

  return out.filter((block) => block !== "");
}

/** The Markdown for pasted `html`. */
export function htmlToMarkdown(html: string): string {
  const body = new DOMParser().parseFromString(html, "text/html").body;

  return blocks(body)
    .join("\n\n")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}
