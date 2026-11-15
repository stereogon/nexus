/**
 * Colouring words in the notes (2026-11-15, at the user's request, after Notion): a text
 * colour, or a background behind the words, in Notion's nine colours.
 *
 * Written as Notion itself writes them in Markdown, `<span color="red">words</span>`, and
 * `color="red_bg"` for a background, so a note moved between the two keeps its colours and any
 * Markdown reader shows the words. Unlike a highlight a colour means nothing: it carries no
 * letter and is not collected in the library. One colour to a span; choosing another inside it
 * changes it, text to background included.
 *
 * Pure, as `marks.ts` is: finding the spans in a line, and what painting a selection changes.
 * Which spans sit inside code is decided by the caller from the syntax tree.
 */
import type { Change } from "./marks";

/** Notion's colours, in its order. Each is a text colour and a background. */
export const COLOURS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;

export type Colour = (typeof COLOURS)[number];

/** A colour, on the words or behind them. */
export interface Paint {
  readonly colour: Colour;
  readonly background: boolean;
}

/** A span as written: its whole extent, its words, and its paint. */
export interface PaintSpan {
  readonly from: number;
  readonly to: number;
  readonly innerFrom: number;
  readonly innerTo: number;
  readonly paint: Paint;
}

/** `<span color="…">` + words without another span in them + `</span>`. */
const SPAN = new RegExp(`<span color="(${COLOURS.join("|")})(_bg)?">((?:(?!</?span\\b).)+?)</span>`, "g");

/** The word Notion writes for `paint`: `red`, or `red_bg`. */
export function paintName(paint: Paint): string {
  return paint.background ? `${paint.colour}_bg` : paint.colour;
}

/** The spans in one line, with offsets made absolute by `offset`. */
export function paintsIn(line: string, offset = 0): PaintSpan[] {
  return [...line.matchAll(SPAN)].flatMap((match) => {
    const colour = COLOURS.find((known) => known === match[1]);
    const words = match[3] ?? "";

    if (colour === undefined) {
      return [];
    }

    const paint = { colour, background: match[2] !== undefined };
    const from = offset + match.index;
    const innerFrom = from + `<span color="${paintName(paint)}">`.length;

    return [{ from, to: from + match[0].length, innerFrom, innerTo: innerFrom + words.length, paint }];
  });
}

/** `text` painted, in the form `paintsIn` reads back. */
export function painted(text: string, paint: Paint): string {
  return `<span color="${paintName(paint)}">${text}</span>`;
}

/**
 * What painting `from`–`to` changes; `null` takes off the paint it is in.
 *
 * Inside an existing span, that span is repainted or unwrapped, so a colour is never nested
 * in another. Otherwise each line of the selection is wrapped on its own, without the spaces
 * at its ends, as a highlight is (`markChanges`): a span does not cross a line here.
 */
export function paintChanges(doc: string, from: number, to: number, paint: Paint | null): Change[] {
  const lineStart = doc.lastIndexOf("\n", from - 1) + 1;
  const lineEnd = doc.indexOf("\n", from) === -1 ? doc.length : doc.indexOf("\n", from);
  const around = paintsIn(doc.slice(lineStart, lineEnd), lineStart).find((span) => span.from <= from && to <= span.to);

  if (around !== undefined) {
    const words = doc.slice(around.innerFrom, around.innerTo);

    return [{ from: around.from, to: around.to, insert: paint === null ? words : painted(words, paint) }];
  }

  if (paint === null) {
    return [];
  }

  const changes: Change[] = [];

  for (let start = from; start < to; ) {
    const newline = doc.indexOf("\n", start);
    const end = newline === -1 || newline > to ? to : newline;
    const piece = doc.slice(start, end);
    const lead = piece.length - piece.trimStart().length;
    const body = piece.trim();

    if (body !== "") {
      changes.push({ from: start + lead, to: start + lead + body.length, insert: painted(body, paint) });
    }

    start = end + 1;
  }

  return changes;
}
