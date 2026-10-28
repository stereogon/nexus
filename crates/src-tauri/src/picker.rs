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
/// # Why this is `async` and callback-driven
///
/// The first version called `blocking_pick_folder` from a plain `fn`, with a comment
/// asserting that was safe because "a non-async Tauri command already runs on a worker
/// thread". That is backwards: a **sync** command runs on the **main** thread, and
/// `#[tauri::command(async)]` is what moves one to a worker. So it dispatched the sheet to
/// the main thread and then blocked that same thread waiting for it. The sheet appeared,
/// the run loop stopped, and the app had to be force quit.
///
/// This version does not depend on knowing which thread it runs on. `pick_folder` is the
/// non-blocking form: it hands the request to the main thread and returns immediately, the
/// callback fires later, and the `await` here parks the task instead of occupying a thread.
/// No thread is blocked on any thread, so there is no arrangement of them that deadlocks --
/// which matters more than getting the threading model right, because being wrong about it
/// is what caused the bug.
// No `needless_pass_by_value` exception is needed any more: the handle is moved into the
// request rather than only read, so clippy is satisfied by the signature itself. The
// `#[expect]` that used to sit here reported itself as unfulfilled the moment that became
// true, which is exactly why it was an `expect` and not an `allow`.
#[tauri::command]
pub async fn pick_vault_directory(app: AppHandle) -> Option<String> {
    // Capacity 1, and exactly one message is ever sent, so the callback's `blocking_send`
    // finds the channel empty and returns without waiting.
    let (sender, mut receiver) = tauri::async_runtime::channel(1);

    app.dialog()
        .file()
        .set_title("Choose a vault folder")
        .pick_folder(move |chosen| {
            // Dropped if the receiver is gone, which happens only if the window closed
            // while the sheet was open. Nothing to report in that case.
            let _ = sender.blocking_send(chosen);
        });

    receiver
        .recv()
        .await
        .flatten()
        .and_then(|chosen| chosen.into_path().ok())
        .map(|path| path.display().to_string())
}
