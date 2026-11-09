/**
 * What to say after an import, for one file or for a handful dropped at once.
 *
 * Pure, and separate from the components, because this is the part worth testing: there is
 * no component test harness yet (`@testing-library/react` is an install, and §2 makes that
 * the user's call), so logic that lives inside a component is logic nothing checks.
 */
import type { CommandError, LectureRow } from "../ipc/vault";

/** What became of one dropped file. */
export type DropOutcome =
  | { readonly kind: "added"; readonly lecture: LectureRow; readonly path: string }
  | { readonly kind: "refused"; readonly error: CommandError };

type Added = Extract<DropOutcome, { kind: "added" }>;
type Refused = Extract<DropOutcome, { kind: "refused" }>;

const isAdded = (outcome: DropOutcome): outcome is Added =>
  outcome.kind === "added";

const isRefused = (outcome: DropOutcome): outcome is Refused =>
  outcome.kind === "refused";

/** Whether a lecture is still waiting for a PDF, whichever way it got there. */
function lacksPdf(lecture: LectureRow): boolean {
  return lecture.conversion === "failed" || lecture.conversion === "queued";
}

/**
 * The name a document would have had, when the import gave it the next free one because
 * something in the folder already had it ("Raft" arriving as "Raft 2", 2026-11-09): read
 * from the file's own name, so a file already called "Raft 2" is not mistaken for one.
 */
export function renamedFrom(lecture: LectureRow, path: string): string | null {
  const file = (path.split(/[\\/]/u).pop() ?? "").replace(/\.[^.]+$/u, "");
  const counted = /^(.*) (\d+)$/u.exec(lecture.title);
  const original = counted?.[1];

  return original !== undefined && file.endsWith(original) && !file.endsWith(lecture.title) ? original : null;
}

/**
 * What to say after importing one document.
 *
 * An import that could not convert still succeeded, so this reports the state rather than
 * treating it as a failure — and says what it means for the person, not what the enum is
 * called.
 */
export function noteFor(lecture: LectureRow, path = ""): string {
  const original = renamedFrom(lecture, path);
  const named = original === null ? "" : ` “${original}” was already in this folder, so this one is “${lecture.title}”.`;

  return `${conversionNote(lecture)}${named}`;
}

function conversionNote(lecture: LectureRow): string {
  switch (lecture.conversion) {
    case "failed":
      return `Added "${lecture.title}", but it could not be converted to a PDF. The original is kept, so you can still take notes beside it.`;
    case "queued":
      return `Added "${lecture.title}". It needs LibreOffice to be converted before it can be opened, and none was found.`;
    case "converting":
      return `Added "${lecture.title}". It is still converting.`;
    case "ready":
    case "notRequired":
      return `Added "${lecture.title}".`;
  }
}

/**
 * One note for a whole drop, however it went.
 *
 * Built from outcomes rather than thrown on the first failure, because §1.4 applies to a
 * drop of four files where the third is a screenshot: the other three were imported, and an
 * error that hid that would send someone looking for lectures that are already there.
 *
 * Identical remediation sentences are said once. Dropping six `.txt` files is one mistake,
 * not six, and repeating the same advice six times reads like the app is shouting.
 */
export function noteForDrop(outcomes: readonly DropOutcome[]): string | null {
  const added = outcomes.filter(isAdded);
  const refused = outcomes.filter(isRefused);
  const [only] = added;

  if (added.length === 0 && refused.length === 0) {
    return null;
  }

  // One file is the common case, and it already has a sentence naming it. A summary would
  // be a worse answer to a smaller question.
  if (added.length === 1 && refused.length === 0 && only !== undefined) {
    return noteFor(only.lecture, only.path);
  }

  const parts: string[] = [];

  if (added.length > 0) {
    parts.push(
      added.length === 1
        ? "Added 1 document."
        : `Added ${String(added.length)} documents.`,
    );
  }

  const renamed = added.filter((outcome) => renamedFrom(outcome.lecture, outcome.path) !== null).length;

  if (renamed > 0) {
    parts.push(
      renamed === 1
        ? "1 was given a number after its name, as one by that name was already there."
        : `${String(renamed)} were given a number after their names, as ones by those names were already there.`,
    );
  }

  const waiting = added.filter((outcome) => lacksPdf(outcome.lecture)).length;

  if (waiting > 0) {
    parts.push(
      `${String(waiting)} of them could not be converted to a PDF yet; the originals are kept, so you can still take notes beside them.`,
    );
  }

  if (refused.length > 0) {
    const reasons = [...new Set(refused.map((outcome) => outcome.error.remediation))];

    parts.push(
      refused.length === 1
        ? `1 file could not be added. ${reasons.join(" ")}`
        : `${String(refused.length)} files could not be added. ${reasons.join(" ")}`,
    );
  }

  return parts.join(" ");
}

/**
 * Imports everything dropped on the window, one file at a time, and says how it went.
 *
 * Sequential rather than concurrent: an import allocates a folder name from the document's
 * title, so two files landing together could race for the same one. Slower by exactly the
 * amount that makes it correct.
 *
 * Each failure is caught per file. One screenshot among four slide decks must not discard
 * the news that the decks are in — §1.4 — so outcomes are collected and reported together
 * rather than thrown on the first refusal.
 *
 * `importOne` is a parameter rather than an import so this is testable without a Tauri
 * window, which is the same reason the rest of this module is pure.
 */
export async function importEach(
  vault: string,
  paths: readonly string[],
  importOne: (vault: string, path: string) => Promise<LectureRow>,
  asError: (thrown: unknown) => CommandError,
): Promise<string | null> {
  const outcomes: DropOutcome[] = [];

  for (const path of paths) {
    try {
      outcomes.push({ kind: "added", lecture: await importOne(vault, path), path });
    } catch (thrown: unknown) {
      outcomes.push({ kind: "refused", error: asError(thrown) });
    }
  }

  return noteForDrop(outcomes);
}
