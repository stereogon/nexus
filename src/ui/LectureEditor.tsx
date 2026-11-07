/**
 * The form for renaming an item, numbering and tagging it, and moving it to a folder.
 *
 * The title and the number sit first because they are the fields most likely to need
 * fixing: for a document both are taken from the name of the file it was imported from,
 * which is often something like `TMSCOMSSAD18~TMSCOMSSSE01~2026~1`, or numbered someone
 * else's way. The number orders the items in a folder, so changing it moves the item.
 *
 * Course, module and week are no longer asked for (2026-11-06): the folder an item is in
 * says where it belongs, and typing it again into every item was the chore the user
 * wanted gone. Values already saved are sent back unchanged rather than cleared, so
 * nothing in an older file is lost by editing it here.
 */
import { useState } from "react";

import type { LectureEdit, LectureRow } from "../ipc/vault";
import { parentOf, spoken } from "./folders";

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
  wide = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly placeholder: string;
  /** Across the whole sheet, rather than one of two beside each other. */
  readonly wide?: boolean;
}) {
  return (
    <label className={wide ? "field wide" : "field"}>
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
  folders,
  vaultName,
  busy,
  onSave,
  onCancel,
}: {
  readonly lecture: LectureRow;
  /** Every folder it could be moved to. */
  readonly folders: readonly string[];
  /** What the top of the vault is called in the folder menu. */
  readonly vaultName: string;
  readonly busy: boolean;
  /** The edit, and the folder it should be in (`""` for the top of the vault). */
  readonly onSave: (edit: LectureEdit, folder: string) => void;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState<LectureEdit>(() => startingFrom(lecture));
  const [folder, setFolder] = useState(() => parentOf(lecture.directory));
  // Imported before numbers were their own field, the number may still be in the title.
  const offer = lecture.numberInTitle;
  const offering = offer !== null && draft.number.trim() === "" && draft.title === lecture.title;

  return (
    <form
      className="editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft, folder);
      }}
    >
      <Field
        label="Title"
        onChange={(title) => {
          setDraft({ ...draft, title });
        }}
        placeholder="Raft consensus"
        value={draft.title}
        wide
      />
      <Field
        label="Number"
        onChange={(number) => {
          setDraft({ ...draft, number });
        }}
        placeholder="3"
        value={draft.number}
      />
      <label className="field">
        <span>Folder</span>
        <select
          onChange={(event) => {
            setFolder(event.target.value);
          }}
          value={folder}
        >
          <option value="">{vaultName}</option>
          {folders.map((path) => (
            <option key={path} value={path}>
              {spoken(path)}
            </option>
          ))}
        </select>
      </label>
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
        wide
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
          Leave a field empty to clear it. A number orders the items in a folder; moving an item
          takes its notes and highlights with it.
        </span>
      </div>
    </form>
  );
}
