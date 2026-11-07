/**
 * The vault commands, and the schemas that validate what they return.
 *
 * # Why this layer exists at all
 *
 * `invoke` returns `unknown`, which is the honest type: the value crossed a process
 * boundary and TypeScript knows nothing about it. CLAUDE.md section 4 requires every IPC
 * payload to be validated with Zod before use, so this module is the only place in the
 * app that calls `invoke`, and every path out of it is already parsed.
 *
 * That makes the boundary testable without a running app: the schemas are values, and a
 * fixture produced by Rust can be parsed against them in a unit test.
 *
 * # Errors
 *
 * A Rust command that fails rejects with `CommandError` — a stable code and one plain
 * sentence saying what to do next (CLAUDE.md section 1.4). Deliberately *not* the error's
 * `Display` text, which interpolates paths. So a rejection is itself a payload needing
 * validation, and `asCommandError` does that rather than trusting its shape.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import * as z from "zod";

/** The conversion states the UI can be told about, matching `name_of` in `vault.rs`. */
export const ConversionStateSchema = z.enum([
  "notRequired",
  "queued",
  "converting",
  "ready",
  "failed",
]);

/**
 * One item in the vault, as a sidebar row: a `document` imported from a file, or a plain
 * `note` made in Nexus with nothing beside its notes.
 *
 * Still named for lectures, as the Rust crates are: the word left the window on 2026-11-06,
 * when Nexus stopped being only for coursework, and renaming every type that carries it
 * would be churn no reader of the window ever sees.
 */
export const LectureRowSchema = z.object({
  directory: z.string(),
  kind: z.enum(["document", "note"]),
  title: z.string(),
  /** When it was made, as RFC 3339; shown under the notes' title. */
  createdAt: z.string(),
  /** Its number in the course, if it has one. */
  number: z.string().nullable(),
  /**
   * For a lecture with no number whose title holds one — imported before numbers were their
   * own field — the number and the title without it, for the editor to offer.
   */
  numberInTitle: z.object({ number: z.string(), title: z.string() }).nullable(),
  sequence: z.string(),
  course: z.string().nullable(),
  module: z.string().nullable(),
  week: z.string().nullable(),
  tags: z.array(z.string()),
  conversion: ConversionStateSchema,
  documentReady: z.boolean(),
});

/** Something the vault walk could not use, with a reason to show. */
export const ProblemRowSchema = z.object({
  directory: z.string(),
  remediation: z.string(),
});

/**
 * Everything one vault holds, including what could not be read.
 *
 * Three lists, mirroring `LoadedVault` in Rust for the reason recorded there: a vault of
 * three hundred lectures with one corrupt manifest must still open.
 */
export const VaultSummarySchema = z.object({
  root: z.string(),
  lectures: z.array(LectureRowSchema),
  /** Every folder that holds items rather than being one, so an empty folder still shows. */
  folders: z.array(z.string()),
  skipped: z.array(ProblemRowSchema),
  unloadable: z.array(ProblemRowSchema),
});

/** A failure, in the only two terms the UI needs. */
export const CommandErrorSchema = z.object({
  code: z.string(),
  remediation: z.string(),
});

export type ConversionState = z.infer<typeof ConversionStateSchema>;
export type LectureRow = z.infer<typeof LectureRowSchema>;
export type ProblemRow = z.infer<typeof ProblemRowSchema>;
export type VaultSummary = z.infer<typeof VaultSummarySchema>;
export type CommandError = z.infer<typeof CommandErrorSchema>;

/**
 * Narrows an unknown rejection to the error contract, or describes why it could not be.
 *
 * A rejection that does not match is a bug in the adapter rather than something the
 * person did, so it says so instead of showing them a Zod report they cannot act on.
 */
export function asCommandError(thrown: unknown): CommandError {
  const parsed = CommandErrorSchema.safeParse(thrown);

  if (parsed.success) {
    return parsed.data;
  }

  // Checked before the generic message, because outside the Nexus window every call
  // fails for one knowable reason and blaming Nexus for it would be untrue.
  if (!isTauri()) {
    return {
      code: "ERR_NOT_THE_NEXUS_WINDOW",
      remediation:
        "This page is the development server, opened in a browser. Nexus reads your " +
        "files through its own window, which a browser tab has no way to reach, so " +
        "nothing here can work. Run `npm run tauri dev` and use the window it opens.",
    };
  }

  return {
    code: "ERR_UNEXPECTED_IPC_FAILURE",
    remediation:
      "Nexus hit a failure it does not have a message for. This is a bug in Nexus " +
      "rather than something you did. The log is in the ~/Library/Logs/Nexus folder, " +
      "in the file for today's date.",
  };
}

/** The four named facets, as the editor sends them. An empty string clears one. */
export interface LectureEdit {
  /** What to call it. Never blank — the Rust side refuses that rather than ignoring it. */
  readonly title: string;
  /** Its number in the course; empty clears it. A new number moves the lecture to its place. */
  readonly number: string;
  readonly course: string;
  readonly module: string;
  readonly week: string;
  readonly tags: readonly string[];
}

/**
 * Renames a lecture and files it under a course, module, week and tags.
 *
 * This is how a lecture comes to be in a week: by saying so in its own manifest, not by
 * moving it. The folder does not change, which is what lets one lecture be in a week *and*
 * a topic *and* an exam list at once — and it is also why a rename moves nothing: §3 makes
 * the folder layout a derived projection, so the title and the directory name are allowed
 * to disagree until a reorganize re-derives it.
 *
 * @throws {CommandError} if the lecture cannot be read or a facet is not a usable label.
 */
export async function editLecture(
  vault: string,
  directory: string,
  edit: LectureEdit,
): Promise<LectureRow> {
  const payload: unknown = await invoke("edit_lecture", {
    vault,
    directory,
    edit: { ...edit, tags: [...edit.tags] },
  });

  return LectureRowSchema.parse(payload);
}

/**
 * Imports a document into the vault, converting it if a converter is available.
 *
 * Resolves to the lecture that was created. A conversion that *fails* is not a rejection:
 * the row comes back with `conversion: "failed"`, because a document Nexus cannot render is
 * still one the person may want to keep notes beside.
 *
 * @throws {CommandError} if the vault cannot be opened, the file is not an importable
 * format, or a lecture of that name is already there.
 */
export async function importDocument(vault: string, folder: string, file: string): Promise<LectureRow> {
  const payload: unknown = await invoke("import_document", { vault, folder, file });

  return LectureRowSchema.parse(payload);
}

/**
 * Makes an empty folder called `name` inside `parent` (`""` for the top of the vault).
 * Resolves to the new folder's path.
 *
 * @throws {CommandError} if the name is not usable or something of that name is there.
 */
export async function createFolder(vault: string, parent: string, name: string): Promise<string> {
  const payload: unknown = await invoke("create_folder", { vault, parent, name });

  return z.string().parse(payload);
}

/**
 * Makes a plain note titled `title` inside `parent`.
 *
 * @throws {CommandError} as {@link createFolder}.
 */
export async function createNote(vault: string, parent: string, title: string): Promise<LectureRow> {
  const payload: unknown = await invoke("create_note", { vault, parent, title });

  return LectureRowSchema.parse(payload);
}

/**
 * Deletes the item at `directory` by moving it, whole, into the vault's hidden `.trash`
 * folder, where Finder can bring it back. Resolves to where it went.
 *
 * @throws {CommandError} if the item is gone or could not be moved; it is then left as it was.
 */
export async function deleteItem(vault: string, directory: string): Promise<string> {
  const payload: unknown = await invoke("delete_item", { vault, directory });

  return z.string().parse(payload);
}

/** An item after a move, and why its remembered place could not follow it, if it could not. */
export const MovedItemSchema = z.object({
  item: LectureRowSchema,
  placeLost: CommandErrorSchema.nullable(),
});

export type MovedItem = z.infer<typeof MovedItemSchema>;

/**
 * Moves the item at `directory` into `folder` (`""` for the top of the vault).
 *
 * @throws {CommandError} if the item or folder is gone, or the folder already holds
 * something of that name — never by writing over it.
 */
export async function moveItem(vault: string, directory: string, folder: string): Promise<MovedItem> {
  const payload: unknown = await invoke("move_item", { vault, directory, folder });

  return MovedItemSchema.parse(payload);
}

/**
 * Opens a vault and lists what is in it.
 *
 * @throws {CommandError} if the path cannot be used as a vault. One unreadable folder or
 * one corrupt manifest arrives inside the summary instead, not as a rejection.
 */
export async function openVault(path: string): Promise<VaultSummary> {
  const payload: unknown = await invoke("open_vault", { path });

  return VaultSummarySchema.parse(payload);
}

/**
 * What `last_vault` sends: a path, or nothing remembered.
 *
 * Exported so the shape can be asserted directly. It is the one payload in this file with
 * no object around it, which makes it the one most easily got wrong on either side — Rust
 * sends `null` for `None`, and a schema that accepted `""` as well would turn "nothing
 * remembered" into a path pointing at the app bundle.
 */
export const LastVaultSchema = z.string().nullable();

/**
 * Records the vault to reopen on the next launch.
 *
 * Does not reject on a failure to record: the Rust side logs it and carries on, because
 * losing a convenience must not be the reason opening a vault reports an error.
 */
export async function rememberVault(path: string): Promise<void> {
  await invoke("remember_vault", { path });
}

/**
 * The vault to reopen, or `null` if there is none to reopen.
 *
 * `null` covers nothing recorded yet *and* a vault that has since moved, been renamed or
 * been deleted. They are not distinguished because the answer to all of them is the same
 * screen: choose a vault.
 */
export async function lastVault(): Promise<string | null> {
  const payload: unknown = await invoke("last_vault");

  return LastVaultSchema.parse(payload);
}
