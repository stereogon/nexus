/**
 * Whether documents' pages go dark in a dark theme (2026-11-14, at the user's request,
 * amending §3): chosen in Settings, and turned on or off from the moon in a document's bar.
 *
 * A module-level store read with `useSyncExternalStore`, as `errorLog` is, because the two
 * controls are far apart in the tree and a prop through every pane between them would be
 * all wiring. Written onto the document as `data-pages`, which `darkPages.css` keys on.
 */
import { useSyncExternalStore } from "react";

import { lastPageTone, rememberPageTone, type PageTone } from "../ipc/pageTone";

let tone: PageTone = "printed";
// Set once the person chooses, so the recorded tone arriving late cannot undo the choice.
let chosen = false;
const listeners = new Set<() => void>();

function apply(next: PageTone): void {
  tone = next;
  document.documentElement.setAttribute("data-pages", next);

  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function current(): PageTone {
  return tone;
}

/** The tone now, kept current. */
export function usePageTone(): PageTone {
  return useSyncExternalStore(subscribe, current);
}

/** Applies the tone at once and records it in the background, as the theme is. */
export function choosePageTone(next: PageTone): void {
  chosen = true;
  apply(next);
  void rememberPageTone(next);
}

/** Applies the tone this device last chose, unless one has been chosen since launch. */
export async function loadPageTone(): Promise<void> {
  const recorded = await lastPageTone();

  if (!chosen) {
    apply(recorded);
  }
}
