/**
 * The sticky notes on one page: each folded to an icon until clicked, one open at a time,
 * and the note being written, if it is on this page.
 */
import type { Annotation } from "../ipc/annotations";
import { StickyCard } from "./StickyCard";
import type { Stickies } from "./useStickies";

type TextBox = Extract<Annotation, { kind: "textBox" }>;

export function StickyLayer({
  annotations,
  pageIndex,
  width,
  height,
  stickies,
}: {
  readonly annotations: readonly Annotation[];
  readonly pageIndex: number;
  readonly width: number;
  readonly height: number;
  readonly stickies: Stickies;
}) {
  const notes = annotations.filter((annotation): annotation is TextBox => annotation.kind === "textBox");
  const draft = stickies.draft?.pageIndex === pageIndex ? stickies.draft : null;
  const page = { width, height };

  if (notes.length === 0 && draft === null) {
    return null;
  }

  return (
    <div className="sticky-layer">
      {notes.map((note) =>
        stickies.open === note.id ? (
          <StickyCard
            key={note.id}
            onCancel={() => {
              stickies.toggle(note.id);
            }}
            onDelete={() => {
              stickies.remove(note.id);
            }}
            onFold={() => {
              stickies.toggle(note.id);
            }}
            onLink={() => {
              stickies.link(note);
            }}
            onRegion={(region) => {
              stickies.edit(note.id, { region });
            }}
            onSave={(text) => {
              stickies.edit(note.id, { text });
            }}
            page={page}
            region={note.region}
            text={note.text}
          />
        ) : (
          <button
            aria-label={`Sticky note: ${note.text}`}
            className="sticky-icon"
            key={note.id}
            onClick={() => {
              stickies.toggle(note.id);
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            style={{ left: note.region.x * width, top: note.region.y * height }}
            title={note.text}
            type="button"
          >
            <svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
              <path d="M2 1.5h7.5L12.5 4.5V12.5H2z" fill="currentColor" />
              <path d="M9.5 1.5V4.5H12.5" fill="none" stroke="#ffffff" strokeWidth="1" />
            </svg>
          </button>
        ),
      )}

      {draft !== null && (
        <StickyCard
          onCancel={stickies.cancel}
          onDelete={null}
          onFold={stickies.cancel}
          onLink={null}
          onRegion={null}
          onSave={stickies.create}
          page={page}
          region={draft.region}
          text={null}
        />
      )}
    </div>
  );
}
