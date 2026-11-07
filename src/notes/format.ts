/**
 * Formatting in the notes, as Notion offers it: bold, italic, strikethrough, code and links
 * on a selection; headings, lists and quotes on its lines.
 *
 * Still Markdown underneath — the toolbar writes the same characters anyone would type,
 * so `notes.md` stays plain text that any editor reads. Two things Notion has are not
 * offered because Markdown has no way to say them: **underline** (only as raw HTML, which
 * the notes do not render) and **font family or size** (the notes keep their one reading
 * face, per CLAUDE.md §3's type roles).
 *
 * Italic is written `_text_`, not `*text*`, so it can never be confused with bold's `**`
 * when the two are combined.
 *
 * Inline formatting is applied by *inserting* markers around the words rather than by
 * replacing them, so the selection stays on the words and a second format can be added
 * without selecting again — bold, then italic, as in Notion.
 */

export type Inline = "bold" | "italic" | "strike" | "code";
export type Block = "h1" | "h2" | "h3" | "bullet" | "numbered" | "task" | "quote" | "paragraph";

export const MARKER: Record<Inline, string> = { bold: "**", italic: "_", strike: "~~", code: "`" };

/** One edit to the document. */
export interface Change {
  readonly from: number;
  readonly to?: number;
  readonly insert: string;
}

/** The selected pieces of each line, trimmed: a format cannot cross a line, or start with a space. */
function segments(doc: string, from: number, to: number): { from: number; to: number }[] {
  const pieces: { from: number; to: number }[] = [];
  let start = from;

  while (start < to) {
    const newline = doc.indexOf("\n", start);
    const end = newline === -1 || newline > to ? to : newline;
    const piece = doc.slice(start, end);
    const lead = piece.length - piece.trimStart().length;
    const body = piece.trim();

    if (body !== "") {
      pieces.push({ from: start + lead, to: start + lead + body.length });
    }

    start = end + 1;
  }

  return pieces;
}

/** Whether the selection is already wrapped in `inline`'s marker, inside or just outside it. */
export function hasInline(doc: string, from: number, to: number, inline: Inline): boolean {
  const marker = MARKER[inline];
  const width = marker.length;
  const outside = doc.slice(from - width, from) === marker && doc.slice(to, to + width) === marker;
  const inside = to - from > 2 * width && doc.slice(from, from + width) === marker && doc.slice(to - width, to) === marker;
  // `**` is two italic-free asterisks, so bold is not mistaken for italic here; but `_`
  // inside `__` would be — refuse a longer run of the same character.
  const longer = doc.slice(from - width - 1, from - width) === marker[0];

  return (outside && !longer) || inside;
}

/** Adds `inline` to the selection, or takes it away if it is already there. */
export function toggleInline(doc: string, from: number, to: number, inline: Inline): Change[] {
  const marker = MARKER[inline];
  const width = marker.length;

  if (doc.slice(from - width, from) === marker && doc.slice(to, to + width) === marker) {
    return [
      { from: from - width, to: from, insert: "" },
      { from: to, to: to + width, insert: "" },
    ];
  }

  if (hasInline(doc, from, to, inline)) {
    return [
      { from, to: from + width, insert: "" },
      { from: to - width, to, insert: "" },
    ];
  }

  return segments(doc, from, to).flatMap((piece) => [
    { from: piece.from, insert: marker },
    { from: piece.to, insert: marker },
  ]);
}

/**
 * Bold, italic, strikethrough or code at a cursor with nothing selected: a pair of markers
 * with the cursor between them, so what is typed next has the format — choosing it before
 * writing, as Notion lets you. Pressed again on that empty pair, before anything is typed,
 * it takes the pair away, so a press made by mistake leaves nothing behind.
 */
export function inlineAtCursor(doc: string, at: number, inline: Inline): { changes: Change[]; cursor: number } {
  const marker = MARKER[inline];
  const width = marker.length;

  if (doc.slice(at - width, at) === marker && doc.slice(at, at + width) === marker) {
    return { changes: [{ from: at - width, to: at + width, insert: "" }], cursor: at - width };
  }

  return { changes: [{ from: at, insert: marker + marker }], cursor: at + width };
}

/**
 * Whether a cursor `offset` characters into `line` is inside an `inline` run: an odd number
 * of its markers before it and one after it. Counted so `**` is read as bold's marker and
 * never as two of anything else; italic's `_` is not part of any other marker.
 */
export function cursorInside(line: string, offset: number, inline: Inline): boolean {
  const marker = MARKER[inline];
  const before = line.slice(0, offset).split(marker).length - 1;

  return before % 2 === 1 && line.indexOf(marker, offset) !== -1;
}

/** A line's block prefix: indentation, then a heading, list, task or quote marker. */
const PREFIX = /^(\s*)(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)?/;

/**
 * How much of a line's start is a mark the notes keep hidden — a heading's `# `, a list's
 * `- `, a to-do's `- [ ] `, a quote's `> ` — or 0 for none. A numbered list's `1. ` is
 * shown, so it is not counted: there is no hidden text to type in front of.
 */
export function hiddenPrefix(line: string): number {
  const match = PREFIX.exec(line);
  const marker = match?.[2] ?? "";

  return marker === "" || /^\d/.test(marker) ? 0 : (match?.[1]?.length ?? 0) + marker.length;
}

/** What kind of block a line is. */
export function blockOf(line: string): Block {
  const marker = PREFIX.exec(line)?.[2] ?? "";

  if (/^#\s/.test(marker)) return "h1";
  if (/^##\s/.test(marker)) return "h2";
  if (/^###\s/.test(marker)) return "h3";
  if (/^[-*+]\s+\[/.test(marker)) return "task";
  if (/^[-*+]\s/.test(marker)) return "bullet";
  if (/^\d/.test(marker)) return "numbered";
  if (marker.startsWith(">")) return "quote";

  return "paragraph";
}

function prefixFor(block: Block, index: number): string {
  switch (block) {
    case "h1":
      return "# ";
    case "h2":
      return "## ";
    case "h3":
      return "### ";
    case "bullet":
      return "- ";
    case "numbered":
      return `${String(index + 1)}. `;
    case "task":
      return "- [ ] ";
    case "quote":
      return "> ";
    case "paragraph":
      return "";
  }
}

/**
 * Turns every line the selection touches into `block` — or back into a paragraph if they
 * all already are one, so pressing a heading button twice undoes it. Indentation is kept,
 * and a numbered list counts from 1.
 */
export function setBlock(doc: string, from: number, to: number, block: Block): Change[] {
  const first = doc.lastIndexOf("\n", from - 1) + 1;
  const lastEnd = doc.indexOf("\n", to) === -1 ? doc.length : doc.indexOf("\n", to);
  const lines = doc.slice(first, lastEnd).split("\n");
  const already = lines.every((line) => blockOf(line) === block);
  const target = already ? "paragraph" : block;
  const changes: Change[] = [];
  let at = first;

  lines.forEach((line, index) => {
    const match = PREFIX.exec(line);
    const indent = match?.[1] ?? "";
    const marker = match?.[2] ?? "";

    changes.push({ from: at + indent.length, to: at + indent.length + marker.length, insert: prefixFor(target, index) });
    at += line.length + 1;
  });

  return changes;
}

/**
 * A link around the selection, `[words]()`, with where the cursor goes to type the
 * address: between the brackets. There is no dialog; the address is just typed, as it
 * would be by hand.
 */
export function linkAround(doc: string, from: number, to: number): { changes: Change[]; cursor: number } {
  const words = doc.slice(from, to);

  return {
    changes: [{ from, to, insert: `[${words}]()` }],
    // With nothing selected there are no words yet, so the cursor goes where they are typed.
    cursor: words === "" ? from + 1 : from + words.length + 3,
  };
}
