import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Vite configuration for the Nexus desktop shell.
 *
 * Nothing here may introduce a network request at runtime. The app is offline by
 * definition (CLAUDE.md), the webview enforces it with a `default-src 'self'` CSP in
 * `tauri.conf.json`, and this config is the other half of that promise: assets are
 * bundled, never fetched from a CDN.
 */
export default defineConfig({
  plugins: [react()],

  // Tauri's `devUrl` points at this exact port. `strictPort` makes a clash a loud failure
  // rather than Vite quietly moving to 1421 and the window loading nothing.
  server: { port: 1420, strictPort: true },

  // Tauri on macOS uses WKWebView, which tracks Safari. Targeting Safari 15 keeps the
  // output honest about what the shipped runtime actually supports.
  build: { outDir: "dist", target: "safari15", sourcemap: true },

  // Vite clearing the terminal would wipe the Rust compiler's output above it.
  clearScreen: false,
});
