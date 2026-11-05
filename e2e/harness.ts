/**
 * Boots the real app in a browser tab, with the Rust side replaced by `backend.ts`.
 *
 * # Why not drive the real window
 *
 * `claude-spec.md` §5.3 asked for Playwright against the app itself, checking the files a
 * journey leaves on disk. On macOS that cannot be done: Tauri's WebDriver bridge,
 * `tauri-driver`, supports Linux and Windows only, because the WKWebView a macOS app
 * embeds exposes no WebDriver interface. Nothing can attach to the Nexus window.
 *
 * What can be done, and what the bugs found so far needed, is the window's own half: the
 * same React tree, the same stylesheets, in WebKit — the engine WKWebView is — so layout,
 * scrolling and positioning behave as they do in the app. What reaches disk stays where it
 * is already tested, in the Rust integration tests against real temporary vaults. The
 * amendment is recorded next to §5.3, dated 2026-11-05.
 *
 * Everything here runs before `main.tsx` is imported, so the app never sees a moment
 * without its IPC.
 */
import { emit } from "@tauri-apps/api/event";
import { mockConvertFileSrc, mockIPC, mockWindows } from "@tauri-apps/api/mocks";

import { backend } from "./backend";
import { standardFixture } from "./fixture";

// The window label the real app runs under. `getCurrentWebview()` — which the drop
// handler uses — reads it from the window metadata this installs.
mockWindows("main");

// Events mocked too: the drop handler subscribes to the webview's drag-and-drop events,
// and an unanswered subscription would reject at startup.
mockIPC(backend(window.__NEXUS_E2E__ ?? standardFixture()), { shouldMockEvents: true });

// The Windows form of the URL, `http://asset.localhost/…`, on purpose. The macOS form is
// a custom `asset://` scheme, which Playwright cannot intercept; an HTTP URL it can, and
// `nexus.ts` answers it with the generated PDF.
mockConvertFileSrc("windows");

// `asCommandError` reports every failure outside the real window as "this is a browser
// tab". The harness *is* the window for this purpose, so a backend failure has to read as
// one — otherwise a broken command would surface as a message blaming the environment.
Object.assign(globalThis, { isTauri: true });

// A file dragged from Finder arrives as Tauri events, which only the native side sends. With
// events mocked, emitting one here reaches the webview's listeners the same way.
window.__NEXUS_E2E_EMIT__ = (event, payload) => emit(event, payload);

await import("../src/main");
