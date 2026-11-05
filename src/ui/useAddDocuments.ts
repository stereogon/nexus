/**
 * The ways a document comes into the vault: the file picker, ⌘O, and dropping files on the
 * window. Moved out of `App` on 2026-11-05, when the error panel's wiring took it past 300
 * lines; it is one job — adding documents — and was the largest piece of `App` that was.
 *
 * Each goes through `against`, which runs the change and then re-reads the vault, so the
 * sidebar shows what is on disk rather than a list patched in place.
 */
import { useCallback } from "react";

import { pickDocument } from "../ipc/picker";
import { asCommandError, importDocument } from "../ipc/vault";
import { importEach, noteFor } from "./dropped";
import { useDropZone, type DropZone } from "./useDropZone";
import { useMetaShortcut } from "./useMetaShortcut";

export function useAddDocuments(
  vault: string | null,
  busy: boolean,
  against: (vault: string, act: () => Promise<string | null>) => void,
): { readonly add: () => void; readonly zone: DropZone } {
  const add = useCallback(() => {
    if (vault === null) {
      return;
    }

    against(vault, async () => {
      const file = await pickDocument();

      return file === null ? null : noteFor(await importDocument(vault, file));
    });
  }, [against, vault]);

  const dropped = useCallback(
    (paths: readonly string[]) => {
      if (vault !== null) {
        against(vault, () => importEach(vault, paths, importDocument, asCommandError));
      }
    },
    [against, vault],
  );

  const zone = useDropZone(dropped);

  // The canvas's drop state promises ⌘O opens the browser, so it has to.
  useMetaShortcut("o", vault !== null && !busy, add);

  return { add, zone };
}
