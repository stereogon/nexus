/**
 * The form for filing a lecture under a course, module, week and tags.
 *
 * Deliberately four plain fields and no autocomplete over existing values. The vault is
 * the only source of truth for what courses exist, and offering a list built from it would
 * quietly discourage creating the first lecture of a new course — which is exactly the
 * moment someone needs to.
 */
import { useState } from "react";

import type { FacetEdit, LectureRow } from "../ipc/vault";

/** A blank field clears the facet, so these start as whatever the lecture already has. */
function startingFrom(lecture: LectureRow): FacetEdit {
  return {
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

export function FacetEditor({
  lecture,
  busy,
  onSave,
  onCancel,
}: {
  readonly lecture: LectureRow;
  readonly busy: boolean;
  readonly onSave: (facets: FacetEdit) => void;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState<FacetEdit>(() => startingFrom(lecture));

  return (
    <form
      className="editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
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
        <span className="hint">Leave a field empty to clear it.</span>
      </div>
    </form>
  );
}
