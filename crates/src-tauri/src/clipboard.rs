//! The clipboard's text, for ⌘⇧V — paste as plain text — in the notes (2026-11-09).
//!
//! The web view does not turn ⌘⇧V into a paste event, so the page never sees the
//! clipboard, and reading it from the page shows the web view's own "Paste" prompt each
//! time. This reads it
//! natively, through `tauri-plugin-clipboard-manager`, and only the text: the webview is
//! granted none of the plugin's own commands, so it cannot write the clipboard or read
//! anything else from it.

use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

/// What is on the clipboard as text, or `None` when there is none. Nothing on the
/// clipboard as text — an image, or empty — is the usual reason the read fails, and it is
/// an answer rather than a fault, so it is not logged: ⌘⇧V then pastes nothing, as ⌘V
/// would. The text itself is never logged either (CLAUDE.md §4).
///
/// Async, as the pickers are, so the read runs off the main thread.
#[tauri::command]
pub async fn clipboard_text(app: AppHandle) -> Option<String> {
    app.clipboard().read_text().ok()
}
