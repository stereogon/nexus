/**
 * The form for naming a lecture and filing it under a course, module, week and tags.
 *
 * Deliberately plain fields and no autocomplete over existing values. The vault is the only
 * source of truth for what courses exist, and offering a list built from it would quietly
 * discourage creating the first lecture of a new course — which is exactly the moment
 * someone needs to.
 *
 * The title and the number sit first because they are the fields most likely to need
 * fixing: both are taken from the name of the file a lecture was imported from, and a
 * university download is called something like `TMSCOMSSAD18~TMSCOMSSSE01~2026~1`, or
 * numbers its slides the professor's own way. The number is what orders the lectures, so
 * changing it moves the lecture.
 */
import { useState } from "react";

import type { LectureEdit, LectureRow } from "../ipc/vault";

/** A blank field clears the facet, so these start as whatever the lecture already has. */
function startingFrom(lecture: LectureRow): LectureEdit {
  return {
    title: lecture.title,
    number: lecture.number ?? "",
    course: lecture.course ?? "",
    module: lecture.module ?? "",
    week: lecture.week ?? "",
    tags: lecture.tags,
  };
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly placeholder: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={placeholder}
        type="text"
        value={value}
      />
    </label>
  );
}

export function LectureEditor({
  lecture,
  busy,
  onSave,
  onCancel,
}: {
  readonly lecture: LectureRow;
  readonly busy: boolean;
  readonly onSave: (edit: LectureEdit) => void;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState<LectureEdit>(() => startingFrom(lecture));
  // Imported before numbers were their own field, the number may still be in the title.
  const offer = lecture.numberInTitle;
  const offering = offer !== null && draft.number.trim() === "" && draft.title === lecture.title;

  return (
    <form
      className="editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <Field
        label="Title"
        onChange={(title) => {
          setDraft({ ...draft, title });
        }}
        placeholder="Raft Consensus"
        value={draft.title}
      />
      <Field
        label="Number"
        onChange={(number) => {
          setDraft({ ...draft, number });
        }}
        placeholder="3"
        value={draft.number}
      />
      {offering && (
        <button
          className="secondary editor-offer"
          onClick={() => {
            setDraft({ ...draft, number: offer.number, title: offer.title });
          }}
          type="button"
        >
          Take “{offer.number}” out of the title
        </button>
      )}
      <Field
        label="Course"
        onChange={(course) => {
          setDraft({ ...draft, course });
        }}
        placeholder="CS454 Distributed Systems"
        value={draft.course}
      />
      <Field
        label="Module"
        onChange={(module) => {
          setDraft({ ...draft, module });
        }}
        placeholder="Consensus"
        value={draft.module}
      />
      <Field
        label="Week"
        onChange={(week) => {
          setDraft({ ...draft, week });
        }}
        placeholder="Week 3"
        value={draft.week}
      />
      <Field
        label="Tags"
        onChange={(tags) => {
          setDraft({
            ...draft,
            // Split on commas rather than offering a tag-by-tag control: typing
            // "exam, consensus" is how someone already thinks of a tag list.
            tags: tags
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0),
          });
        }}
        placeholder="exam, consensus"
        value={draft.tags.join(", ")}
      />

      <div className="editor-actions">
        <button disabled={busy} type="submit">
          Save
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <span className="hint">
          Leave a field empty to clear it. A new number moves the lecture to its place; renaming
          does not move the folder.
        </span>
      </div>
    </form>
  );
}
