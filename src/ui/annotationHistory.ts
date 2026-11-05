/**
 * Undo and redo for what is marked on the document: highlights, boxes and sticky notes.
 *
 * # Why each step is two snapshots, and each move a target
 *
 * A step records one annotation before and after a change — `null` for "not there". Undoing
 * moves it *to* the before state; redoing moves it *to* the after. The command for each
 * move is an absolute target, never a relative one: "remove it", "put it back as it was",
 * "mark it as key", "move it here". So doing a move twice is harmless — a restore of one
 * already there writes nothing, a retag to the colour it has writes nothing — and a step
 * whose command failed can be left where it went without the history lying about the file.
 *
 * Taking back a removal restores the annotation whole rather than adding a new one, because
 * a new one gets a new id, and every citation of it in the notes would then read "removed".
 *
 * The history belongs to the lecture it was made in, and to this window's session: it is
 * not saved, and opening another lecture starts it again.
 */
import {
  editTextBox,
  removeAnnotation,
  restoreAnnotation,
  retagAnnotation,
  type Annotation,
  type HighlightSemantic,
  type TextBoxEdit,
} from "../ipc/annotations";

/** One annotation, before and after one change; `null` is "not on the lecture". */
export interface Step {
  readonly before: Annotation | null;
  readonly after: Annotation | null;
}

export interface History {
  readonly past: readonly Step[];
  readonly future: readonly Step[];
}

export const NO_HISTORY: History = { past: [], future: [] };

/** How many steps are kept. Far more than anyone takes back, and a bound on memory. */
export const HISTORY_LIMIT = 100;

/** A command that brings one annotation to a state. */
export type Move =
  | { readonly kind: "remove"; readonly id: string }
  | { readonly kind: "restore"; readonly annotation: Annotation }
  | { readonly kind: "retag"; readonly id: string; readonly semantic: HighlightSemantic }
  | { readonly kind: "rebox"; readonly id: string; readonly edit: TextBoxEdit };

/** A change made, which clears what could have been redone — the usual rule. */
export function recorded(history: History, step: Step): History {
  return { past: [...history.past, step].slice(-HISTORY_LIMIT), future: [] };
}

/** The step to take back and the history after it, or `null` when there is none. */
export function undone(history: History): { readonly step: Step; readonly history: History } | null {
  const step = history.past.at(-1);

  return step === undefined
    ? null
    : { step, history: { past: history.past.slice(0, -1), future: [...history.future, step] } };
}

/** The step to do again and the history after it, or `null` when there is none. */
export function redone(history: History): { readonly step: Step; readonly history: History } | null {
  const step = history.future.at(-1);

  return step === undefined
    ? null
    : { step, history: { past: [...history.past, step], future: history.future.slice(0, -1) } };
}

/** The command that takes an annotation from `from` to `to`, or `null` if there is none. */
export function toward(from: Annotation | null, to: Annotation | null): Move | null {
  if (to === null) {
    return from === null ? null : { kind: "remove", id: from.id };
  }

  if (from === null) {
    return { kind: "restore", annotation: to };
  }

  // A sticky note changes where it is and what it says; a highlight changes only what it
  // means. Those are the only edits there are.
  return to.kind === "textBox"
    ? { kind: "rebox", id: to.id, edit: { region: to.region, text: to.text } }
    : { kind: "retag", id: to.id, semantic: to.semantic };
}

/** The id a move is about. */
export function movedId(move: Move): string {
  return move.kind === "restore" ? move.annotation.id : move.id;
}

/** Runs a move, resolving to the annotation as it now stands, or `null` for gone. */
export async function run(vault: string, directory: string, move: Move): Promise<Annotation | null> {
  switch (move.kind) {
    case "remove":
      await removeAnnotation(vault, directory, move.id);
      return null;
    case "restore":
      return restoreAnnotation(vault, directory, move.annotation);
    case "retag":
      return retagAnnotation(vault, directory, move.id, move.semantic);
    case "rebox":
      return editTextBox(vault, directory, move.id, move.edit);
  }
}
