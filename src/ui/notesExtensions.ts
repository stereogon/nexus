/**
 * What the notes editor is built with (moved out of `NotesEditor` on 2026-11-09, unchanged,
 * so that file keeps to the view's life and what is drawn over it): history and keys,
 * GFM, the live preview and its widgets, pasting images and formatted text, the chart form's and the table
 * picker's openers, the "/" menu, and the editing behaviour in `notes/editing.ts`.
 */
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Compartment, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder, type ViewUpdate } from "@codemirror/view";

import { chartOpener, type ChartAt } from "../notes/chartEditing";
import { citeLinks } from "../notes/citeLinks";
import { codeLanguages } from "../notes/codeLanguages";
import { noteEditing } from "../notes/editing";
import { lineFlash } from "../notes/flash";
import { formatKeys } from "../notes/markSelection";
import { pageHeading, type PageHeading } from "../notes/pageHeading";
import { pasteImages } from "../notes/pasteImage";
import { richPaste } from "../notes/richPaste";
import { slashCommands } from "../notes/slash";
import { livePreview } from "../notes/preview/field";
import { tablePicker, type TableLine } from "../notes/tableInsert";
import { notePage, notesAppearance } from "../notes/theme";
import { turnInto } from "./blockMenus";

/**
 * Whether the notes are laid out as a page, centred under their title: a plain note, and a
 * document's notes shown alone (2026-11-09). Its own compartment so it can change without
 * rebuilding the editor, which would lose the cursor and the undo history.
 */
export const pageLayout = new Compartment();

/** The page layout for `page`. */
export const layoutFor = (page: boolean): Extension => (page ? notePage : []);

export interface NotesSetup {
  /** A plain note's whole page, rather than notes beside a document. */
  readonly page: boolean;
  readonly heading: PageHeading;
  readonly onCite: (id: string) => void;
  readonly imageUrl: (src: string) => string | null;
  /** Keeps a pasted image, resolving to the path to link, or `null` if it was not kept. */
  readonly keepImage: () => (file: File) => Promise<string | null>;
  readonly onChart: (at: ChartAt) => void;
  readonly onTable: (line: TableLine) => void;
  readonly onUpdate: (update: ViewUpdate) => void;
}

export function notesExtensions(setup: NotesSetup): Extension {
  return [
    history(),
    keymap.of([...formatKeys, ...defaultKeymap, ...historyKeymap]),
    // GitHub-flavoured: tables, strikethrough and task lists, which plain CommonMark
    // does not have. Without it a table was not even recognised (2026-11-05).
    markdown({ base: markdownLanguage, codeLanguages }),
    EditorView.lineWrapping,
    // Drawn by the editor: WebKit did not paint its caret below the title (2026-11-07).
    drawSelection(),
    notesAppearance,
    pageLayout.of(layoutFor(setup.page)),
    pageHeading(setup.heading),
    lineFlash,
    livePreview({ onCite: setup.onCite, imageUrl: setup.imageUrl }),
    placeholder("Start writing. Beside a document, select text in it and choose “Link to notes” to cite it here."),
    citeLinks(setup.onCite),
    pasteImages(setup.keepImage),
    // After the image paste, which takes a pasted picture first.
    richPaste,
    chartOpener.of(setup.onChart),
    tablePicker.of(setup.onTable),
    noteEditing,
    // The "/" menu offers what `+`'s does.
    slashCommands((view) => turnInto(view)),
    EditorView.updateListener.of(setup.onUpdate),
  ];
}
