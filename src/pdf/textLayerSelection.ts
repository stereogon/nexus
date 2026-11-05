/**
 * Keeping a mouse selection whole when it is dragged past the end of the text.
 *
 * Ported from pdf.js's own viewer — `TextLayerBuilder#bindMouse` and
 * `#enableGlobalSelectionListener` in pdf.js 6.4 — which this app does not use: it builds
 * text layers with the bare `TextLayer` class, and that class leaves selection to the
 * browser entirely. Named here so the next reader can compare it against the original
 * rather than treat it as a mechanism invented for this app.
 *
 * # The problem it solves
 *
 * A text layer is a scatter of absolutely-positioned spans with nothing between them.
 * Drag from a word past the end of its line and the pointer leaves every span: WebKit has
 * no text node under it, and collapses the selection to nothing. Found on 2026-11-05 by
 * the Playwright suite — a drag that overshoots the line, which is how most people select,
 * produced an empty selection and therefore no highlight menu at all. Only a drag that
 * stopped inside the last letter worked.
 *
 * # How
 *
 * Each layer gets a trailing `.endOfContent` element. Pressing the mouse in a layer marks
 * it `selecting`, which stretches that element across the layer behind the spans, so a
 * drag into empty space lands on *something*. While the selection changes, the element is
 * moved to sit just after the selection's moving end, so the browser extends the
 * selection to the last real text rather than jumping across the page. Releasing the
 * pointer puts everything back.
 *
 * pdf.js skips the moving step in Firefox and in Chromium 148+, which get this right on
 * their own. WebKit does not, and WebKit is the only engine Nexus runs in.
 */

const SELECTING = "selecting";
const END_OF_CONTENT = "endOfContent";

/** Every live text layer, with its trailing element. */
const layers = new Map<HTMLElement, HTMLElement>();

/** The global listeners, present while at least one layer is. */
let listening: AbortController | null = null;

/** The previous range, to tell which end of the selection is the one moving. */
let previous: Range | null = null;

/** Puts a layer back as it was before the drag. */
function reset(end: HTMLElement, layer: HTMLElement): void {
  layer.append(end);
  end.style.width = "";
  end.style.height = "";
  end.style.userSelect = "";
  layer.classList.remove(SELECTING);
}

function resetAll(): void {
  layers.forEach(reset);
}

/**
 * The element the moving end of the range sits in or after.
 *
 * A boundary at offset 0 of the end container means the selection ends *before* that
 * node, so the anchor is the nearest earlier node that has content. pdf.js walks for it
 * unguarded; here the walk stops at the layer, so it cannot climb out of the document.
 */
function anchorOf(range: Range, movingStart: boolean): Element | null {
  const container = movingStart ? range.startContainer : range.endContainer;
  let anchor: Node | null =
    container.nodeType === Node.TEXT_NODE ? container.parentNode : container;

  if (!movingStart && range.endOffset === 0) {
    do {
      while (anchor !== null && anchor.previousSibling === null) {
        if (anchor instanceof Element && anchor.classList.contains("textLayer")) {
          return null;
        }

        anchor = anchor.parentNode;
      }

      anchor = anchor?.previousSibling ?? null;
    } while (anchor !== null && anchor.childNodes.length === 0);
  }

  return anchor instanceof Element ? anchor : null;
}

function onSelectionChange(): void {
  const selection = document.getSelection();

  if (selection === null || selection.rangeCount === 0) {
    resetAll();
    previous = null;
    return;
  }

  const range = selection.getRangeAt(0);

  for (const [layer, end] of layers) {
    if (range.intersectsNode(layer)) {
      layer.classList.add(SELECTING);
    } else {
      reset(end, layer);
    }
  }

  const movingStart =
    previous !== null &&
    (range.compareBoundaryPoints(Range.END_TO_END, previous) === 0 ||
      range.compareBoundaryPoints(Range.START_TO_END, previous) === 0);
  const anchor = anchorOf(range, movingStart);
  const layer = anchor?.parentElement?.closest(".textLayer");
  const end = layer instanceof HTMLElement ? layers.get(layer) : undefined;

  if (anchor !== null && layer instanceof HTMLElement && end !== undefined) {
    end.style.width = layer.style.width;
    end.style.height = layer.style.height;
    end.style.userSelect = "text";
    anchor.parentElement?.insertBefore(end, movingStart ? anchor : anchor.nextSibling);
  }

  previous = range.cloneRange();
}

function listen(): void {
  if (listening !== null) {
    return;
  }

  listening = new AbortController();

  const { signal } = listening;
  let pointerDown = false;

  document.addEventListener("pointerdown", () => {
    pointerDown = true;
  }, { signal });
  document.addEventListener("pointerup", () => {
    pointerDown = false;
    resetAll();
  }, { signal });
  window.addEventListener("blur", () => {
    pointerDown = false;
    resetAll();
  }, { signal });
  document.addEventListener("keyup", () => {
    if (!pointerDown) {
      resetAll();
    }
  }, { signal });
  document.addEventListener("selectionchange", onSelectionChange, { signal });
}

/**
 * Makes drag-selection in one text layer behave, until the returned function is called.
 *
 * Call it after the layer's spans exist: the trailing element has to come after them.
 */
export function keepSelectionWhole(layer: HTMLElement): () => void {
  const end = document.createElement("div");

  end.className = END_OF_CONTENT;
  layer.append(end);

  const onMouseDown = () => {
    layer.classList.add(SELECTING);
  };

  layer.addEventListener("mousedown", onMouseDown);
  layers.set(layer, end);
  listen();

  return () => {
    layer.removeEventListener("mousedown", onMouseDown);
    layers.delete(layer);
    end.remove();

    if (layers.size === 0) {
      listening?.abort();
      listening = null;
      previous = null;
    }
  };
}
