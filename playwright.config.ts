/**
 * The Playwright suite: the window's half of the app, in WebKit.
 *
 * Why it does not drive the real Nexus window is in `e2e/harness.ts`. In short: nothing
 * can attach to a WKWebView on macOS, so the same React tree runs in WebKit — the engine
 * that view is — with the Rust side answered from a fixture.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",

  // No retries. A test that passes on its second attempt is a race that has been hidden,
  // and CLAUDE.md §4 names "a retry added to paper over a race" as not acceptable.
  retries: 0,
  forbidOnly: true,
  reporter: "list",

  use: {
    baseURL: "http://localhost:1420",
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
    command: "npm run dev",
    url: "http://localhost:1420/e2e/harness.html",
    // Never reuse. If `npm run app` already holds the port, the run should stop and say
    // so, not quietly test whatever that server happens to be serving.
    reuseExistingServer: false,
  },
});
