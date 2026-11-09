/**
 * The notes' formatting controls, in two places: floating over a selection, as Notion does,
 * or docked under the notes' header, opened from it at any time — so a format can be
 * chosen before writing, not only applied to words already there (asked for 2026-11-07).
 * The controls are one component, so the two can never offer different things.
 *
 * Inline styles — bold, italic, strikethrough, code, link — then block types — three
 * heading levels, bulleted, numbered and task lists, quote — then the highlights. Each
 * shows pressed when the selection already has it, and pressing it again takes it off.
 * Not on the canvas, which has no notes toolbar; designed here, owing an artboard.
 */
import type { HighlightSemantic } from "../ipc/annotations";
import type { Block, Inline } from "../notes/format";
import type { MenuAt } from "./menuPlacement";
import { SEMANTIC_GLYPH, SEMANTIC_LABEL, SEMANTICS } from "./semantics";
import { useFloating } from "./useFloating";

/** What the selection already has, so the bar can show it pressed. */
export interface FormatState {
  readonly inline: Readonly<Record<Inline, boolean>>;
  readonly block: Block;
  readonly highlight: HighlightSemantic | null;
}

// Each button's glyph is set in its own style, by a class named in full so it can be found.
const INLINE: readonly { kind: Inline; label: string; glyph: string; keys: string; look: string }[] = [
  { kind: "bold", label: "Bold", glyph: "B", keys: "⌘B", look: "format-button format-bold" },
  { kind: "italic", label: "Italic", glyph: "I", keys: "⌘I", look: "format-button format-italic" },
  { kind: "strike", label: "Strikethrough", glyph: "S", keys: "⌘⇧S", look: "format-button format-strike" },
  { kind: "code", label: "Code", glyph: "</>", keys: "⌘E", look: "format-button format-code" },
];

const BLOCKS: readonly { kind: Block; label: string; glyph: string; keys: string }[] = [
  { kind: "h1", label: "Heading 1", glyph: "H1", keys: "⌘⌥1" },
  { kind: "h2", label: "Heading 2", glyph: "H2", keys: "⌘⌥2" },
  { kind: "h3", label: "Heading 3", glyph: "H3", keys: "⌘⌥3" },
  { kind: "bullet", label: "Bulleted list", glyph: "•", keys: "⌘⌥5" },
  { kind: "numbered", label: "Numbered list", glyph: "1.", keys: "⌘⌥6" },
  { kind: "task", label: "To-do list", glyph: "☐", keys: "⌘⌥4" },
  { kind: "quote", label: "Quote", glyph: "❝", keys: "" },
];

/** What every format control does, wherever the controls are. */
interface Handlers {
  readonly state: FormatState;
  /** Whether words are selected. A highlight needs some, or a highlight to sit in. */
  readonly selected: boolean;
  /**
   * In a table cell: only bold, italic, strikethrough and code apply there. A cell is one
   * line of a table, so it holds no heading, list, quote, link or highlight.
   */
  readonly inCell: boolean;
  readonly onInline: (kind: Inline) => void;
  readonly onBlock: (kind: Block) => void;
  readonly onLink: () => void;
  readonly onHighlight: (semantic: HighlightSemantic | null) => void;
}

/** Pressing a control must not take focus from the selection or cursor it applies to. */
const keepFocus = (event: { preventDefault: () => void }) => {
  event.preventDefault();
};

function FormatControls({ state, selected, inCell, onInline, onBlock, onLink, onHighlight }: Handlers) {
  const tip = (label: string, keys: string) => (keys === "" ? label : `${label} (${keys})`);
  // An empty highlight would be invisible, so the colours wait for words; inside an
  // existing highlight they recolour or remove it.
  const marking = !inCell && (selected || state.highlight !== null);

  return (
    <>
      {INLINE.map(({ kind, label, glyph, keys, look }) => (
        <button
          aria-label={label}
          aria-pressed={state.inline[kind]}
          className={look}
          key={kind}
          onClick={() => {
            onInline(kind);
          }}
          title={tip(label, keys)}
          type="button"
        >
          {glyph}
        </button>
      ))}
      <button aria-label="Link" className="format-button" disabled={inCell} onClick={onLink} title={tip("Link", "⌘K")} type="button">
        ↗
      </button>

      <span aria-hidden="true" className="format-divider" />

      {BLOCKS.map(({ kind, label, glyph, keys }) => (
        <button
          aria-label={label}
          aria-pressed={state.block === kind}
          className="format-button"
          disabled={inCell}
          key={kind}
          onClick={() => {
            onBlock(kind);
          }}
          title={tip(label, keys)}
          type="button"
        >
          {glyph}
        </button>
      ))}

      <span aria-hidden="true" className="format-divider" />

      <span aria-label="Highlight as" className="format-swatches" role="group">
        {SEMANTICS.map((semantic) => (
          <button
            aria-label={SEMANTIC_LABEL[semantic]}
            disabled={!marking}
            aria-pressed={state.highlight === null ? undefined : state.highlight === semantic}
            className="highlight-pick"
            data-semantic={semantic}
            key={semantic}
            onClick={() => {
              onHighlight(semantic);
            }}
            title={state.highlight === null ? SEMANTIC_LABEL[semantic] : `${SEMANTIC_LABEL[semantic]} (⌘⇧H for key)`}
            type="button"
          >
            {SEMANTIC_GLYPH[semantic]}
          </button>
        ))}
        {state.highlight !== null && (
          <button
            className="highlight-remove"
            onClick={() => {
              onHighlight(null);
            }}
            type="button"
          >
            Remove
          </button>
        )}
      </span>
    </>
  );
}

/** The controls floating over a selection. */
export function NotesFormatBar({
  at,
  onDismiss,
  ...handlers
}: Handlers & {
  readonly at: MenuAt;
  readonly onDismiss: () => void;
}) {
  const { box, placed } = useFloating(at, onDismiss);

  return (
    <div
      aria-label="Format"
      className="highlight-menu"
      onMouseDown={keepFocus}
      ref={box}
      role="toolbar"
      style={{ left: placed.left, top: placed.top }}
    >
      <FormatControls {...handlers} />
    </div>
  );
}

/** The same controls docked under the notes' header, there before anything is written. */
export function NotesFormatStrip(handlers: Handlers) {
  return (
    <div aria-label="Format" className="format-strip" onMouseDown={keepFocus} role="toolbar">
      <FormatControls {...handlers} />
    </div>
  );
}
