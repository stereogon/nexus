/**
 * The bar over a selection in the notes: formatting, as Notion offers it, then the four
 * highlight colours the document uses.
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

export function NotesFormatBar({
  at,
  state,
  onInline,
  onBlock,
  onLink,
  onHighlight,
  onDismiss,
}: {
  readonly at: MenuAt;
  readonly state: FormatState;
  readonly onInline: (kind: Inline) => void;
  readonly onBlock: (kind: Block) => void;
  readonly onLink: () => void;
  readonly onHighlight: (semantic: HighlightSemantic | null) => void;
  readonly onDismiss: () => void;
}) {
  const { box, placed } = useFloating(at, onDismiss);
  const tip = (label: string, keys: string) => (keys === "" ? label : `${label} (${keys})`);

  return (
    <div
      aria-label="Format"
      className="highlight-menu"
      // Pressing a control must not take focus from the selection it applies to.
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      ref={box}
      role="toolbar"
      style={{ left: placed.left, top: placed.top }}
    >
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
      <button aria-label="Link" className="format-button" onClick={onLink} title={tip("Link", "⌘K")} type="button">
        ↗
      </button>

      <span aria-hidden="true" className="format-divider" />

      {BLOCKS.map(({ kind, label, glyph, keys }) => (
        <button
          aria-label={label}
          aria-pressed={state.block === kind}
          className="format-button"
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
    </div>
  );
}
