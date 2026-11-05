/**
 * One sticky note, open: its words, and the means to move, resize, edit, cite or fold it.
 *
 * Positions are page fractions throughout (§3); this converts to pixels only to draw and
 * to read a drag. A drag or resize previews locally and is stored once, when the pointer
 * is released — one write per gesture, not one per pixel.
 *
 * A draft (`text === null`) opens straight into editing. Save or Enter keeps it, and ✕ or
 * Escape abandons it: a sticky's text is one paragraph, so Enter has nothing else to mean.
 * The Save button was added on 2026-11-05: until then Enter was the only way, and the hint
 * saying so was cut off on a small card, so a new note had no visible way to be kept.
 */
import { useState, type PointerEvent } from "react";

import type { NormalizedRect } from "../ipc/annotations";
import { legible, movedBy, resizedBy } from "../pdf/sticky";

type Gesture = { readonly kind: "move" | "resize"; readonly x: number; readonly y: number; readonly from: NormalizedRect };

export function StickyCard({
  region,
  page,
  text,
  onSave,
  onCancel,
  onRegion,
  onDelete,
  onLink,
  onFold,
}: {
  readonly region: NormalizedRect;
  readonly page: { readonly width: number; readonly height: number };
  /** The note's words, or `null` for a draft not yet stored. */
  readonly text: string | null;
  readonly onSave: (text: string) => void;
  readonly onCancel: () => void;
  /** Moved or resized; `null` for a draft, which is stored where it was started. */
  readonly onRegion: ((region: NormalizedRect) => void) | null;
  readonly onDelete: (() => void) | null;
  readonly onLink: (() => void) | null;
  readonly onFold: () => void;
}) {
  const [editing, setEditing] = useState(text === null);
  const [value, setValue] = useState(text ?? "");
  const [preview, setPreview] = useState<NormalizedRect | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  // Never smaller on screen than its buttons and a few lines need; see `legible`.
  const shown = legible(preview ?? region, page);

  const begin = (kind: Gesture["kind"]) => (event: PointerEvent<HTMLElement>) => {
    if (onRegion === null) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGesture({ kind, x: event.clientX, y: event.clientY, from: legible(region, page) });
  };

  const follow = (event: PointerEvent<HTMLElement>) => {
    if (gesture === null) {
      return;
    }

    const dx = (event.clientX - gesture.x) / page.width;
    const dy = (event.clientY - gesture.y) / page.height;

    setPreview(gesture.kind === "move" ? movedBy(gesture.from, dx, dy) : resizedBy(gesture.from, dx, dy));
  };

  const end = () => {
    if (gesture !== null && preview !== null && onRegion !== null) {
      onRegion(preview);
    }

    setGesture(null);
    setPreview(null);
  };

  /** Keeps what was typed: a draft is stored, an existing note reworded. */
  const save = () => {
    if (text === null) {
      if (value.trim() !== "") {
        onSave(value.trim());
      }
    } else {
      finish();
    }
  };

  const finish = () => {
    const words = value.trim();

    if (words === "") {
      return;
    }

    if (words !== text) {
      onSave(words);
    }

    setEditing(false);
  };

  return (
    <div
      aria-label={text === null ? "New sticky note" : "Sticky note"}
      className="sticky-card"
      // Keeps a press inside the card from starting a box or a selection on the page.
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      role="group"
      style={{
        left: shown.x * page.width,
        top: shown.y * page.height,
        width: shown.width * page.width,
        height: shown.height * page.height,
      }}
    >
      <div className="sticky-head">
        <span
          aria-label="Move the sticky note"
          className="sticky-grip"
          onPointerDown={begin("move")}
          onPointerMove={follow}
          onPointerUp={end}
          role="button"
          tabIndex={-1}
        />
        {editing && (
          <button
            className="sticky-action sticky-save"
            disabled={value.trim() === ""}
            // Keeps focus in the text, whose blur would otherwise finish the edit first and
            // take this button away before the click lands.
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={save}
            title="Keep this note (Enter)"
            type="button"
          >
            Save
          </button>
        )}
        {onLink !== null && (
          <button className="sticky-action" onClick={onLink} title="Link to notes" type="button">
            Cite
          </button>
        )}
        {onDelete !== null && (
          <button className="sticky-action" onClick={onDelete} title="Delete this sticky note" type="button">
            Delete
          </button>
        )}
        <button aria-label="Fold the sticky note" className="sticky-action" onClick={text === null ? onCancel : onFold} type="button">
          ✕
        </button>
      </div>

      {editing ? (
        <textarea
          aria-label="Sticky note text"
          autoFocus
          className="sticky-text"
          onBlur={() => {
            if (text !== null) {
              finish();
            }
          }}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            } else if (event.key === "Escape") {
              event.preventDefault();

              if (text === null) {
                onCancel();
              } else {
                setValue(text);
                setEditing(false);
              }
            }
          }}
          placeholder="Write a note…"
          value={value}
        />
      ) : (
        <p
          className="sticky-words"
          onDoubleClick={() => {
            setEditing(true);
          }}
          title="Double-click to edit"
        >
          {text}
        </p>
      )}

      {onRegion !== null && (
        <span
          aria-label="Resize the sticky note"
          className="sticky-resize"
          onPointerDown={begin("resize")}
          onPointerMove={follow}
          onPointerUp={end}
          role="button"
          tabIndex={-1}
        />
      )}
    </div>
  );
}
