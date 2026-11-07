/**
 * The notes as blocks, the way Notion treats a page: what a line's block is, and moving a
 * block somewhere else. Behind the ⋮⋮ handle beside each line (2026-11-07).
 *
 * A block is one line, because in Markdown a line is a paragraph, a heading or a list item —
 * except where several lines only mean something together: a fenced code block, and a
 * table, each of which moves whole. Pure, so moving is tested without an editor.
 */

/** A block, as its first and last lines, 1-based and inclusive. */
export interface Block {
  readonly from: number;
  readonly to: number;
}

const FENCE = /^\s*(`{3,}|~{3,})/;
const TABLE_ROW = /^\s*\|/;

/** Which lines each fenced code block spans, so a line inside one is part of it. */
function fences(lines: readonly string[]): Block[] {
  const found: Block[] = [];
  let open: { readonly line: number; readonly marker: string } | null = null;

  for (const [index, text] of lines.entries()) {
    const marker = FENCE.exec(text)?.[1]?.charAt(0);

    if (marker === undefined) {
      continue;
    }

    if (open === null) {
      open = { line: index + 1, marker };
    } else if (marker === open.marker) {
      found.push({ from: open.line, to: index + 1 });
      open = null;
    }
  }

  // An unclosed fence runs to the end, as a Markdown reader treats it.
  if (open !== null) {
    found.push({ from: open.line, to: lines.length });
  }

  return found;
}

/** The block line `line` (1-based) belongs to. */
export function blockAt(doc: string, line: number): Block {
  const lines = doc.split("\n");
  const fence = fences(lines).find((block) => line >= block.from && line <= block.to);

  if (fence !== undefined) {
    return fence;
  }

  if (TABLE_ROW.test(lines[line - 1] ?? "")) {
    let from = line;
    let to = line;

    while (from > 1 && TABLE_ROW.test(lines[from - 2] ?? "")) {
      from -= 1;
    }

    while (to < lines.length && TABLE_ROW.test(lines[to] ?? "")) {
      to += 1;
    }

    return { from, to };
  }

  return { from: line, to: line };
}

/**
 * The notes with `block` moved to just before line `before` (1-based; one past the last
 * line moves it to the end), and the line it now starts on. Moving a block onto itself
 * changes nothing.
 */
export function moveBlock(doc: string, block: Block, before: number): { readonly text: string; readonly line: number } {
  if (before >= block.from && before <= block.to + 1) {
    return { text: doc, line: block.from };
  }

  const lines = doc.split("\n");
  const moving = lines.slice(block.from - 1, block.to);
  const rest = [...lines.slice(0, block.from - 1), ...lines.slice(block.to)];
  // Where `before` is once the block has left: lines after it moved up by its length.
  const at = before > block.to ? before - moving.length : before;

  rest.splice(at - 1, 0, ...moving);

  return { text: rest.join("\n"), line: at };
}

/** A heading in the notes: its line, its level (1–6) and its words. */
export interface Heading {
  readonly line: number;
  readonly level: number;
  readonly text: string;
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

/** The notes' headings, in order, leaving out anything that only looks like one in a code block. */
export function headingsOf(doc: string): Heading[] {
  const lines = doc.split("\n");
  const inCode = fences(lines);

  return lines.flatMap((text, index) => {
    const line = index + 1;
    const match = HEADING.exec(text);

    if (match?.[1] === undefined || match[2] === undefined || inCode.some((block) => line >= block.from && line <= block.to)) {
      return [];
    }

    return [{ line, level: match[1].length, text: match[2] }];
  });
}
