/**
 * The Playwright suite: the window's half of the app, in WebKit.
 *
 * Why it does not drive the real Nexus window is in `e2e/harness.ts`. In short: nothing
 * can attach to a WKWebView on macOS, so the same React tree runs in WebKit — the engine
 * that view is — with the Rust side answered from a fixture.
 */
import { defineConfig, devices } from "@playwright/test";

/**
 * The suite's own dev server port — not 1420, which belongs to `npm run app`.
 *
 * Found on 2026-11-05 when a run collided with the user's own `tauri dev`: sharing the
 * app's port meant the suite could not run while the app was open, which is exactly when
 * someone is most likely to want both.
 */
const PORT = 1431;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",

  // No retries. A test that passes on its second attempt is a race that has been hidden,
  // and CLAUDE.md §4 names "a retry added to paper over a race" as not acceptable.
  retries: 0,
  forbidOnly: true,
  reporter: "list",

  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "webkit",
      // A laptop-sized window: big enough for the sidebar, the document and the editor
      // panel side by side, which is the arrangement most of these journeys are about.
      use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } },
    },
  ],

  webServer: {
    // V8's fast API calls off: Node 26.5 aborted twice on 2026-11-08 while serving a 9 MB
    // module ("Lazy deopt after a fast API call with return value is unsupported"), a crash in
    // the engine, not in the app, that took every journey after it down. Recorded in PROGRESS.
    command: `node --no-turbo-fast-api-calls node_modules/vite/bin/vite.js --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}/e2e/harness.html`,
    // Never reuse: if something already holds this port, stop and say so rather than
    // quietly testing whatever it happens to serve.
    reuseExistingServer: false,
  },
});
