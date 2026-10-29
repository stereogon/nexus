/**
 * Where pdf.js's runtime assets live, named once for both sides.
 *
 * Imported by the engine (which runs in the webview) *and* by `vite/pdfjs-assets.ts`
 * (which runs in Node at build time). It therefore imports nothing at all: a single
 * `node:fs` anywhere in this file's import graph would follow the engine into the browser
 * bundle.
 *
 * Keeping the list here rather than in the plugin is what makes the two agree. The engine
 * asks for `${ASSET_PREFIX}cmaps/`; the plugin is what makes that path exist. If those
 * ever disagreed the symptom would be a lecture quietly rendering without its fonts.
 */

/** The one path the engine is configured with, in dev and in the shipped app. */
export const ASSET_PREFIX = "/pdfjs/";

/**
 * The directories pdf.js fetches lazily, at the moment a document needs them.
 *
 * `cmaps` is CJK encodings, `standard_fonts` the fourteen standard faces for documents
 * that embed none, `iccs` colour profiles, and `wasm` the image codecs — `jbig2` among
 * them, which is what scanned pages use.
 */
export const BUNDLED_DIRECTORIES = [
  "cmaps",
  "standard_fonts",
  "iccs",
  "wasm",
] as const;

/**
 * Never shipped and never served: any file whose name starts with one of these.
 *
 * `quickjs-eval` is what would execute a PDF's own JavaScript. Nexus does not, so with
 * `isEvalSupported` and `enableScripting` both off pdf.js never asks for it — and a file
 * that is not there cannot be reached by a bug either.
 *
 * **A prefix, not a filename, and that is the point.** This first named
 * `quickjs-eval.wasm` alone, and the build was then checked: pdf.js ships a plain-JavaScript
 * fallback beside every wasm module (`jbig2_nowasm_fallback.js`,
 * `openjpeg_nowasm_fallback.js`, `quickjs-eval.js`) for environments where wasm will not
 * load. Withholding only the `.wasm` would have left the script engine reachable by exactly
 * the path that opens when wasm is blocked. The image-codec fallbacks are kept, because
 * decoding a picture is not executing a document.
 */
export const WITHHELD_PREFIXES = ["quickjs-eval"] as const;
