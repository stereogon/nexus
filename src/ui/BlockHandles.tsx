/**
 * Notion's handle beside each line (2026-11-07): `+` adds a line below the block, and ⋮⋮
 * selects the block on a click and opens its menu — delete, duplicate, turn into — or
 * moves it on a drag, with a line showing where it will land. ⌥↑ and ⌥↓ move a line from
 * the keyboard (CodeMirror's own), which the handle's title says.
 *
 * What a block is and how one moves are `notes/blocks.ts`; this follows the pointer and
 * draws. Positions come from the editor's own geometry (`coordsAtPos`), relative to the
 * box holding the editor, so they are right at any scroll and in either pane.
 */
import type { EditorView } from "@codemirror/view";
import { useEffect, useRef, useState, type RefObject } from "react";

import { blockAt, moveBlock, type Block } from "../notes/blocks";
import { selectedBlocks } from "../notes/blockShortcuts";
import { pickedByHandle } from "../notes/markSelection";
import { blockActions, turnInto } from "./blockMenus";
import type { MenuAt } from "./menuPlacement";
import { PopMenu, under } from "./PopMenu";

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
  // ⋮⋮'s menu, for the block it was opened on (Notion's: delete, duplicate, turn into).
  const [actions, setActions] = useState<{ readonly at: MenuAt; readonly block: Block } | null>(null);
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

  const actionsShown =
    actions !== null && editor !== null ? (
      <PopMenu
        at={actions.at}
        items={blockActions(editor, actions.block)}
        label="Block"
        onDismiss={() => {
          setActions(null);
        }}
        opener="block-grip"
      />
    ) : null;

  if (hovered === null) {
    return (
      <>
        {menuShown}
        {actionsShown}
      </>
    );
  }

  // The block selected, unless a selection of several lines takes it in: that stands (2026-11-09).
  const select = (target: EditorView): Block => {
    const doc = target.state.doc;
    const { from, to } = target.state.selection.main;
    const [first, last] = [doc.lineAt(from).number, doc.lineAt(to).number];
    const kept = first !== last && first <= hovered.block.from && last >= hovered.block.to;
    const block = kept ? null : { anchor: doc.line(hovered.block.from).from, head: doc.line(hovered.block.to).to };

    // Marked either way, so the floating format bar puts itself away for the block's menu.
    target.dispatch({ ...(block === null ? {} : { selection: block }), annotations: pickedByHandle.of(true) });
    target.focus();
    return kept ? selectedBlocks(target.state) : hovered.block;
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

    const button = event.currentTarget;
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
        // A click: the block selected, and its menu opened beside the handle.
        setActions({ at: under(button, "left", 220), block: select(editor) });
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
          aria-label="Move this block, or open its menu"
          className="block-handle-button grip"
          data-opens="block-grip"
          onPointerDown={grab}
          title="Drag to move · click for delete, duplicate, turn into · ⌥↑ ⌥↓ from the keyboard"
          type="button"
        >
          <svg aria-hidden="true" fill="currentColor" height="14" viewBox="0 0 10 14" width="10">
            {[3, 7, 11].flatMap((y) => [<circle cx="3" cy={y} key={`l${String(y)}`} r="1.2" />, <circle cx="7" cy={y} key={`r${String(y)}`} r="1.2" />])}
          </svg>
        </button>
      </div>
      {drop !== null && <div aria-hidden="true" className="block-drop" style={{ top: drop - 1 }} />}
      {menuShown}
      {actionsShown}
    </>
  );
}
