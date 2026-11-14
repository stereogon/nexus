/**
 * How the notes behave as they are edited, beyond CodeMirror's own: where the cursor may
 * stand and what Backspace and ``` do (`blockKeys.ts`), Enter in formatted words
 * (`enterKeys.ts`), deleting all of a formatted text
 * taking its marks (`emptiedMarks.ts`), deleting inside a highlight keeping it one
 * (`markEdges.ts`), Tab nesting lists (`indentKeys.ts`) and Notion's
 * block shortcuts (`blockShortcuts.ts`). One bundle, so the editor's setup names the
 * behaviour once.
 */
import type { Extension } from "@codemirror/state";

import { blockKeys } from "./blockKeys";
import { blockShortcuts } from "./blockShortcuts";
import { dropEmptiedMarks } from "./emptiedMarks";
import { enterKeys } from "./enterKeys";
import { indentKeys } from "./indentKeys";
import { keepMarksWhole } from "./markEdges";

export const noteEditing: Extension = [blockKeys, enterKeys, dropEmptiedMarks, keepMarksWhole, indentKeys, blockShortcuts];
