/**
 * The "/" menu's list (2026-11-09), drawn under the "/" while `notes/slash.ts` holds the
 * session. The editor keeps focus throughout: the keys are the editor's, and a click here
 * does not take focus away from where the words are being typed.
 */
import type { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";

import { chooseSlash, matching, type SlashItem, type SlashSession } from "../notes/slash";

export function SlashMenu({ view, session, items }: { readonly view: EditorView; readonly session: SlashSession; readonly items: readonly SlashItem[] }) {
  const found = matching(items, session.query);
  const at = view.coordsAtPos(session.from);
  const list = useRef<HTMLDivElement | null>(null);

  // The chosen item kept in view as ↑ and ↓ move past the menu's edge.
  useEffect(() => {
    list.current?.querySelector(".pop-item.active")?.scrollIntoView({ block: "nearest" });
  }, [session.active]);

  if (at === null) {
    return null;
  }

  return (
    <div aria-label="Insert a block" className="slash-menu pop-menu" ref={list} role="listbox" style={{ left: at.left, top: at.bottom + 6 }}>
      {found.length === 0 ? (
        <p className="pop-note">No block called “{session.query}”</p>
      ) : (
        found.map((item, index) => (
          <button
            aria-selected={index === session.active}
            className={index === session.active ? "pop-item active" : "pop-item"}
            key={item.label}
            onClick={() => {
              chooseSlash(view, item);
            }}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            role="option"
            type="button"
          >
            <span className="pop-label">{item.label}</span>
          </button>
        ))
      )}
    </div>
  );
}
