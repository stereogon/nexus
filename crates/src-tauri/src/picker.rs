//! The folder picker, which is a platform capability rather than something to reimplement.
//!
//! It lives behind an IPC command instead of the `@tauri-apps/plugin-dialog` npm package
//! for two reasons. It avoids a second frontend dependency for one call, and it keeps the
//! platform capability on the Rust side of the boundary, which is where `CLAUDE.md` §3 puts
//! desktop-only capabilities. The UI asks for a folder and gets a string or nothing; it
//! never learns which framework drew the sheet.

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// Asks the person to choose a vault folder.
///
/// Returns `None` when they cancel, which is not a failure and must not be reported as
/// one. Nothing here validates the choice: whether the folder can serve as a vault is
/// `VaultRoot::open`'s decision, and duplicating that check would mean two answers to one
/// question.
///
/// # Blocking
///
/// macOS requires the native sheet on the main thread, and `blocking_pick_folder`
/// dispatches it there and waits. Safe because a non-async Tauri command already runs on a
/// worker thread — called from the main thread it would deadlock, which is why this must
/// stay a plain `fn` rather than becoming `async`.
/// `AppHandle` is taken by value because Tauri requires it: `CommandArg` is implemented for
/// `AppHandle` and not for `&AppHandle`, so a reference fails to compile with
/// `the trait bound &AppHandle: CommandArg is not satisfied`. Checked rather than assumed.
///
/// `expect` rather than `allow` on purpose -- if Tauri ever implements `CommandArg` for a
/// reference, this stops firing and the build tells us the signature can be tightened,
/// instead of the exception outliving its reason.
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri implements CommandArg for AppHandle, not &AppHandle"
)]
#[must_use]
#[tauri::command]
pub fn pick_vault_directory(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .set_title("Choose a vault folder")
        .blocking_pick_folder()
        .and_then(|chosen| chosen.into_path().ok())
        .map(|path| path.display().to_string())
}
