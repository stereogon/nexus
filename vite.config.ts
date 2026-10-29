import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { pdfjsAssets } from "./vite/pdfjs-assets";

/**
 * Vite configuration for the Nexus desktop shell.
 *
 * Nothing here may introduce a network request at runtime. The app is offline by
 * definition (CLAUDE.md), the webview enforces it with a `default-src 'self'` CSP in
 * `tauri.conf.json`, and this config is the other half of that promise: assets are
 * bundled, never fetched from a CDN.
 */
export default defineConfig({
  plugins: [react(), pdfjsAssets()],

  // Tauri's `devUrl` points at this exact port. `strictPort` makes a clash a loud failure
  // rather than Vite quietly moving to 1421 and the window loading nothing.
  server: { port: 1420, strictPort: true },

  // Tauri on macOS uses WKWebView, which tracks Safari. Targeting Safari 15 keeps the
  // output honest about what the shipped runtime actually supports.
  build: { outDir: "dist", target: "safari15", sourcemap: true },

  // Vite clearing the terminal would wipe the Rust compiler's output above it.
  clearScreen: false,

  test: {
    // Vitest stubs CSS imports by default, which makes a `?raw` stylesheet import an empty
    // string and `styles.test.ts` -- the test that checks every class name a component
    // uses is actually defined -- silently vacuous. It needs the real text.
    css: true,

    // `styles.test.ts` finds its inputs with `import.meta.glob`, which Vite resolves at
    // transform time and, with `eager` and `?raw`, inlines into the transformed module.
    // The on-disk transform cache is keyed by the importing file's own content, so adding
    // a component does not change `styles.test.ts` and the cached transform is reused --
    // with the old file list baked in. The new component is then not scanned at all, and
    // the check passes while seeing nothing.
    //
    // Observed on 2026-10-29: `Notice.tsx` was invisible to the scan until an unrelated
    // byte was added to the test file. Its own "cannot pass vacuously" guards did not
    // catch it, because a stale list still has plausible counts -- which is the point
    // worth remembering about guards of that shape.
    //
    // Measured at no cost here: the suite runs in 1.0s either way.
    fsModuleCache: false,
  },
});
