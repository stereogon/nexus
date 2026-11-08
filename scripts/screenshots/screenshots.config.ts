/**
 * Takes the README's screenshots: `npx playwright test -c scripts/screenshots/screenshots.config.ts`.
 *
 * The suite's own harness, mocked backend and sample fixture (`e2e/`), so a screenshot can
 * never contain anyone's real notes. Apart from the suite because it asserts nothing; it
 * only draws.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 1432;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.shots.ts",
  retries: 0,
  reporter: "list",
  use: { baseURL: `http://localhost:${String(PORT)}` },
  projects: [
    {
      name: "webkit",
      // Retina, so the pictures are crisp on the GitHub page.
      use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    // V8's fast API calls off: Node 26.5 aborted twice on 2026-11-08 while serving a 9 MB
    // module ("Lazy deopt after a fast API call with return value is unsupported"), a crash in
    // the engine, not in the app, that took every journey after it down. Recorded in PROGRESS.
    command: `node --no-turbo-fast-api-calls node_modules/vite/bin/vite.js --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}/e2e/harness.html`,
    // From the project's root, where Vite's config is, not from this folder.
    cwd: "../..",
    reuseExistingServer: false,
  },
});
