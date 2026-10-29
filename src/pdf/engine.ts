/**
 * How Nexus opens a PDF, and everything it refuses to let one do.
 *
 * Every option below is here for a reason that is written next to it. The defence against
 * a hostile document is not the surface scan in `lecture-core` — that only tells the
 * person what the file asks for — it is this configuration, which declines to grant it.
 */
import {
  GlobalWorkerOptions,
  VerbosityLevel,
  getDocument,
  type PDFDocumentLoadingTask,
} from "pdfjs-dist";
// Bundled, not fetched: Vite emits this as an asset of the app, so the worker is
// same-origin and `worker-src 'self'` needs no widening. A `blob:` worker would.
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

import { ASSET_PREFIX } from "./assets";

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * The most pixels one decoded image may occupy.
 *
 * A guard against a decompression bomb: a PDF may declare an image of almost any
 * dimensions, and pdf.js will allocate for what it is told. 32 megapixels is about four
 * times a 300-dpi A4 scan, so a real lecture page is nowhere near it, while a page
 * claiming to be 20,000 pixels square is refused instead of exhausting memory.
 */
const MAX_IMAGE_PIXELS = 32_000_000;

/**
 * The parameters every document is opened with.
 *
 * A function rather than a constant so the asset base can be pointed elsewhere in a test,
 * and so there is one place to assert against.
 */
export function hardenedParameters(url: string, assetBase: string = ASSET_PREFIX) {
  return {
    url,

    // Local copies of everything pdf.js would otherwise fetch. Bundled by
    // `vite/pdfjs-assets.ts`; `quickjs-eval.wasm` is deliberately absent from `wasm/`.
    cMapUrl: `${assetBase}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetBase}standard_fonts/`,
    iccUrl: `${assetBase}iccs/`,
    wasmUrl: `${assetBase}wasm/`,

    // The single most important flag here. pdf.js has historically used `eval`-shaped
    // evaluation for embedded font programs, and CVE-2024-4367 turned exactly that into
    // arbitrary script execution from a crafted PDF. Off, so that class of bug has no
    // path at all.
    isEvalSupported: false,

    // A document's own JavaScript is never run, which is also why `quickjs-eval.wasm` is
    // not shipped. A PDF's open actions, form scripts and link actions do nothing here.
    enableScripting: false,

    // XFA is a second document format carried inside a PDF, with its own parser and its
    // own attack surface, and nothing in a lecture deck needs it.
    enableXfa: false,

    // Glyphs are drawn as outlines by pdf.js instead of being installed as CSS fonts. Two
    // reasons: a foreign font program never reaches the operating system's font engine,
    // which is C++ and has its own history; and `font-src` then needs no `blob:` or
    // `data:`, so the CSP stays tight. The cost is rasterisation speed, measured if it
    // ever matters.
    disableFontFace: true,

    // Only the ranges a visible page needs. This is what makes opening a 300-page lecture
    // immediate rather than a full read, and it is why the asset protocol's range support
    // was worth a dependency.
    disableAutoFetch: true,

    maxImageSize: MAX_IMAGE_PIXELS,

    // Nothing is resolved relative to the document, so a reference to an outside file
    // cannot be built from one. Belt as well as braces: the CSP refuses it anyway.
    docBaseUrl: undefined,

    pdfBug: false,
    verbosity: VerbosityLevel.ERRORS,
  };
}

/**
 * Starts opening one document.
 *
 * The **loading task** is returned rather than the document, because in pdf.js 6 the task
 * is what owns `destroy()` — it is what shuts down the worker and abandons in-flight range
 * requests. A caller handed only the document would have no way to stop the work when the
 * person closes the lecture.
 *
 * Its `promise` rejects for a damaged or encrypted file among other reasons. Nexus cannot
 * ask for a password yet, so an encrypted document fails there; the screening step reports
 * an `encrypted` indicator, so the reason is visible rather than mysterious.
 */
export function loadPdf(url: string): PDFDocumentLoadingTask {
  return getDocument(hardenedParameters(url));
}
