/**
 * Notion's handle beside each line (2026-11-07): `+` adds a line below the block, and ⋮⋮
 * selects the block on a click — so the format bar can turn it into a heading or a list —
 * or moves it on a drag, with a line showing where it will land. ⌥↑ and ⌥↓ move a line from
 * the keyboard (CodeMirror's own), which the handle's title says.
 *
 * What a block is and how one moves are `notes/blocks.ts`; this follows the pointer and
 * draws. Positions come from the editor's own geometry (`coordsAtPos`), relative to the
 * box holding the editor, so they are right at any scroll and in either pane.
 */
import type { EditorView } from "@codemirror/view";
import { useEffect, useRef, useState, type RefObject } from "react";

import { blockAt, moveBlock, type Block } from "../notes/blocks";
import type { Block as Kind } from "../notes/format";
import { formatBlock } from "../notes/markSelection";
import type { MenuAt } from "./menuPlacement";
import { PopMenu, under, type MenuItem } from "./PopMenu";

/** The block under the pointer, and where its handle is drawn. */
interface Hovered {
  readonly block: Block;
  readonly top: number;
  readonly left: number;
  readonly height: number;
}

/** How far the pointer must travel before a press on ⋮⋮ is a drag rather than a click. */
const DRAG_THRESHOLD = 4;

/** The line under a height on screen, read at the text's left edge whatever the pointer's x. */
function lineAtY(view: EditorView, y: number): number {
  const content = view.contentDOM.getBoundingClientRect();
  const position = view.posAtCoords({ x: content.left + content.width / 2, y }, false);

  return view.state.doc.lineAt(position).number;
}

/** Where a block's handle goes, relative to `box`. */
function placed(view: EditorView, box: HTMLElement, block: Block): Hovered | null {
  const first = view.state.doc.line(block.from);
  const at = view.coordsAtPos(first.from);

  if (at === null) {
    return null;
  }

  const frame = box.getBoundingClientRect();
  const text = view.contentDOM.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(view.contentDOM).paddingLeft);

  return {
    block,
    top: at.top - frame.top,
    left: Math.max(2, text - frame.left - 50),
    height: at.bottom - at.top,
  };
}

/** Where a dragged block would land: before the block under the pointer, or after it. */
function landing(view: EditorView, y: number): { readonly before: number; readonly top: number } {
  const doc = view.state.doc;
  const target = blockAt(doc.toString(), lineAtY(view, y));
  const first = view.coordsAtPos(doc.line(target.from).from);
  const last = view.coordsAtPos(doc.line(target.to).to);
  const middle = first !== null && last !== null ? (first.top + last.bottom) / 2 : y;

  return y < middle
    ? { before: target.from, top: first?.top ?? y }
    : { before: target.to + 1, top: last?.bottom ?? y };
}

/**
 * What `+`'s menu turns the new line into, as Notion's does: a block type from the format
 * rules, or a code block or a divider written out.
 */
function turnInto(editor: EditorView): MenuItem[] {
  const as = (kind: Kind) => () => {
    formatBlock(editor, kind);
    editor.focus();
  };
  const write = (text: string, cursorAt: number) => () => {
    const line = editor.state.doc.lineAt(editor.state.selection.main.head);

    editor.dispatch({ changes: { from: line.from, to: line.to, insert: text }, selection: { anchor: line.from + cursorAt } });
    editor.focus();
  };

  return [
    { label: "Text", onSelect: () => { editor.focus(); } },
    { label: "Heading 1", onSelect: as("h1") },
    { label: "Heading 2", onSelect: as("h2") },
    { label: "Heading 3", onSelect: as("h3") },
    { label: "Bulleted list", onSelect: as("bullet") },
    { label: "Numbered list", onSelect: as("numbered") },
    { label: "To-do list", onSelect: as("task") },
    { label: "Quote", onSelect: as("quote") },
    { label: "Code", onSelect: write("```\n\n```", 4) },
    { label: "Divider", onSelect: write("---\n", 4) },
  ];
}

export function BlockHandles({
  view,
  box,
  text,
}: {
  readonly view: RefObject<EditorView | null>;
  /** The positioned box holding the editor, which the handle is drawn in. */
  readonly box: RefObject<HTMLElement | null>;
  /** The notes as they now are: typing after `+` closes its menu, as choosing would. */
  readonly text: string;
}) {
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  // The notes when the menu opened, so the line `+` itself added does not close it.
  const openedOn = useRef<string | null>(null);

  useEffect(() => {
    if (openedOn.current !== null && openedOn.current !== text) {
      openedOn.current = null;
      setMenu(null);
    }
  }, [text]);
  const [drop, setDrop] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const frame = box.current;
    const editor = view.current;

    if (frame === null || editor === null) {
      return undefined;
    }

    const onMove = (event: MouseEvent) => {
      if (dragging) {
        return;
      }

      const line = lineAtY(editor, event.clientY);

      setHovered(placed(editor, frame, blockAt(editor.state.doc.toString(), line)));
    };
    const onLeave = () => {
      if (!dragging) {
        setHovered(null);
      }
    };
    // Scrolling moves the lines out from under a drawn handle; it comes back on the next move.
    const onScroll = () => {
      if (!dragging) {
        setHovered(null);
      }
    };

    frame.addEventListener("mousemove", onMove);
    frame.addEventListener("mouseleave", onLeave);
    editor.scrollDOM.addEventListener("scroll", onScroll);

    return () => {
      frame.removeEventListener("mousemove", onMove);
      frame.removeEventListener("mouseleave", onLeave);
      editor.scrollDOM.removeEventListener("scroll", onScroll);
    };
  }, [box, view, dragging]);

  const editor = view.current;
  const menuShown =
    menu !== null && editor !== null ? (
      <PopMenu
        at={menu}
        items={turnInto(editor)}
        label="Turn into"
        note="Turn the new line into"
        onDismiss={() => {
          openedOn.current = null;
          setMenu(null);
        }}
        opener="block-plus"
      />
    ) : null;

  if (hovered === null) {
    return menuShown;
  }

  const select = (target: EditorView) => {
    const doc = target.state.doc;

    target.dispatch({ selection: { anchor: doc.line(hovered.block.from).from, head: doc.line(hovered.block.to).to } });
    target.focus();
  };

  const addBelow = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (editor === null) {
      return;
    }

    const end = editor.state.doc.line(hovered.block.to).to;

    editor.dispatch({ changes: { from: end, insert: "\n" }, selection: { anchor: end + 1 }, scrollIntoView: true });
    editor.focus();
    // Then what the new line should be, as Notion asks (2026-11-07).
    openedOn.current = editor.state.doc.toString();
    setMenu(under(event.currentTarget, "left", 220));
  };

  const grab = (event: React.PointerEvent<HTMLButtonElement>) => {
    const frame = box.current;

    if (editor === null || frame === null) {
      return;
    }

    event.preventDefault();

    const startY = event.clientY;
    const block = hovered.block;
    let moved = false;
    let before: number | null = null;

    const onMove = (move: PointerEvent) => {
      if (!moved && Math.abs(move.clientY - startY) < DRAG_THRESHOLD) {
        return;
      }

      moved = true;
      setDragging(true);

      const land = landing(editor, move.clientY);

      before = land.before;
      setDrop(land.top - frame.getBoundingClientRect().top);
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setDragging(false);
      setDrop(null);

      if (!moved || before === null) {
        select(editor);
        return;
      }

      const result = moveBlock(editor.state.doc.toString(), block, before);

      if (result.text !== editor.state.doc.toString()) {
        editor.dispatch({
          changes: { from: 0, to: editor.state.doc.length, insert: result.text },
          selection: { anchor: editor.state.toText(result.text).line(result.line).from },
          scrollIntoView: true,
        });
      }

      editor.focus();
      setHovered(null);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  return (
    <>
      <div className="block-handle" style={{ top: hovered.top, left: hovered.left, height: hovered.height }}>
        <button
          aria-label="Add a line below"
          className="block-handle-button"
          data-opens="block-plus"
          onClick={addBelow}
          title="Add a line below, and choose what it is"
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" viewBox="0 0 14 14" width="14">
            <path d="M7 2.5v9M2.5 7h9" />
          </svg>
        </button>
        <button
          aria-label="Move or select this block"
          className="block-handle-button grip"
          onPointerDown={grab}
          title="Drag to move · click to select · ⌥↑ ⌥↓ from the keyboard"
          type="button"
        >
          <svg aria-hidden="true" fill="currentColor" height="14" viewBox="0 0 10 14" width="10">
            {[3, 7, 11].flatMap((y) => [<circle cx="3" cy={y} key={`l${String(y)}`} r="1.2" />, <circle cx="7" cy={y} key={`r${String(y)}`} r="1.2" />])}
          </svg>
        </button>
      </div>
      {drop !== null && <div aria-hidden="true" className="block-drop" style={{ top: drop - 1 }} />}
      {menuShown}
    </>
  );
}
