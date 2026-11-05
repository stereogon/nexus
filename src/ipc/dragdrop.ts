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
 * Where the pointer is, as Tauri reports it: in **physical** pixels from the webview's
 * top-left. Read since 2026-11-05, when a drop over the notes started meaning something
 * different from a drop anywhere else.
 */
const PositionSchema = z.object({ x: z.number(), y: z.number() });

/** The four phases of a drag, as Tauri reports them. */
const DragDropPayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("enter"), paths: z.array(z.string()), position: PositionSchema }),
  z.object({ type: z.literal("over"), position: PositionSchema }),
  z.object({ type: z.literal("drop"), paths: z.array(z.string()), position: PositionSchema }),
  z.object({ type: z.literal("leave") }),
]);

export type DragDropPayload = z.infer<typeof DragDropPayloadSchema>;

/** A point in the window, in CSS pixels. */
export interface DragPoint {
  readonly x: number;
  readonly y: number;
}

/** What the window does as a drag arrives, moves, leaves, or lands. */
export interface DragHandlers {
  readonly onEnter: (at: DragPoint) => void;
  readonly onOver: (at: DragPoint) => void;
  readonly onLeave: () => void;
  readonly onDrop: (paths: readonly string[], at: DragPoint) => void;
}

/**
 * Decides what a single drag event means, separated from the subscription so it can be
 * tested without a webview.
 *
 * `scale` is the device pixel ratio: Tauri reports physical pixels, and the page lays out
 * in CSS pixels, so a Retina screen's positions are halved here before anything compares
 * them with a box on the page.
 *
 * An unrecognised payload counts as the drag having left. The alternative is an overlay
 * stuck across the window with no gesture left that dismisses it — the person would have to
 * restart the app to get their vault back.
 */
export function dispatchDrag(payload: unknown, handlers: DragHandlers, scale: number): void {
  const parsed = DragDropPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    handlers.onLeave();

    return;
  }

  const data = parsed.data;
  const at = (position: DragPoint): DragPoint => ({ x: position.x / scale, y: position.y / scale });

  switch (data.type) {
    case "enter":
      handlers.onEnter(at(data.position));

      return;
    case "over":
      handlers.onOver(at(data.position));

      return;
    case "drop":
      handlers.onDrop(data.paths, at(data.position));

      return;
    case "leave":
      handlers.onLeave();

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
    dispatchDrag(event.payload, handlers, window.devicePixelRatio);
  });
}
