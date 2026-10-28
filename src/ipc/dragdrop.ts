/**
 * Files dragged onto the window.
 *
 * # Why this is a Tauri event and not an HTML5 `drop`
 *
 * Only the native side knows the real paths. A browser `DataTransfer` hands over a
 * sandboxed `File` handle and no filesystem path, which is no use to an importer whose job
 * is to copy bytes out of a file the person already has. Tauri captures the OS drag and
 * re-emits it with paths, so this is the only version that can work.
 *
 * # Why it is validated
 *
 * §4: every payload crossing the boundary goes through Zod. That `@tauri-apps/api` declares
 * a type for this is a statement about the compiler, not about what is in the message —
 * and the contents here are the least trustworthy in the app, being whatever the person
 * happened to drag onto the window.
 */
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import * as z from "zod";

/**
 * The four phases of a drag, as Tauri reports them.
 *
 * `position` is deliberately not described: the overlay covers the whole window and does
 * not care where the cursor is, and a schema that reads fields nothing uses invites someone
 * to start using them.
 */
const DragDropPayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("enter"), paths: z.array(z.string()) }),
  z.object({ type: z.literal("over") }),
  z.object({ type: z.literal("drop"), paths: z.array(z.string()) }),
  z.object({ type: z.literal("leave") }),
]);

export type DragDropPayload = z.infer<typeof DragDropPayloadSchema>;

/** What the window does as a drag arrives, leaves, or lands. */
export interface DragHandlers {
  readonly onEnter: () => void;
  readonly onLeave: () => void;
  readonly onDrop: (paths: readonly string[]) => void;
}

/**
 * Decides what a single drag event means, separated from the subscription so it can be
 * tested without a webview.
 *
 * `over` is ignored: it fires on every pointer movement, and nothing on screen depends on
 * where the cursor is, so handling it would re-render the window per mouse move for no
 * visible difference.
 *
 * An unrecognised payload counts as the drag having left. The alternative is an overlay
 * stuck across the window with no gesture left that dismisses it — the person would have to
 * restart the app to get their vault back.
 */
export function dispatchDrag(payload: unknown, handlers: DragHandlers): void {
  const parsed = DragDropPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    handlers.onLeave();

    return;
  }

  switch (parsed.data.type) {
    case "enter":
      handlers.onEnter();

      return;
    case "drop":
      handlers.onDrop(parsed.data.paths);

      return;
    case "leave":
      handlers.onLeave();

      return;
    case "over":
      return;
  }
}

/**
 * Subscribes to drags over this window, resolving to the unsubscribe function.
 *
 * @throws {CommandError} if the webview will not deliver drag events at all.
 */
export async function onFilesDragged(
  handlers: DragHandlers,
): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent((event) => {
    dispatchDrag(event.payload, handlers);
  });
}
