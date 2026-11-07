//! The native pickers, which are a platform capability rather than something to reimplement.
//!
//! These live behind IPC commands instead of the `@tauri-apps/plugin-dialog` npm package
//! for two reasons. It avoids a second frontend dependency, and it keeps the platform
//! capability on the Rust side of the boundary, which is where `CLAUDE.md` §3 puts
//! desktop-only capabilities. The UI asks for a folder or a file and gets a string or
//! nothing; it never learns which framework drew the sheet.
//!
//! # Why these are `async` and callback-driven
//!
//! The first version called `blocking_pick_folder` from a plain `fn`, with a comment
//! asserting that was safe because "a non-async Tauri command already runs on a worker
//! thread". That is backwards: a **sync** command runs on the **main** thread, and
//! `#[tauri::command(async)]` is what moves one to a worker. So it dispatched the native
//! sheet to the main thread and then blocked that same thread waiting for it. The sheet
//! appeared, the run loop stopped, and the app had to be force quit.
//!
//! These do not depend on knowing which thread they run on. The non-blocking dialog forms
//! hand the request to the main thread and return immediately, the callback fires later,
//! and the `await` parks the task instead of occupying a thread. Nothing blocks on
//! anything, so no arrangement of threads deadlocks -- which matters more than getting the
//! threading model right, because being wrong about it is what caused the bug.

use tauri::AppHandle;
use tauri::async_runtime::Sender;
use tauri_plugin_dialog::{DialogExt, FilePath};

/// What Nexus will import. `PDF` is the canonical render format; the rest are converted.
const IMPORTABLE: [&str; 5] = ["pdf", "pptx", "ppt", "docx", "doc"];

/// Awaits a dialog that reports its answer through a callback.
///
/// The channel holds one message and exactly one is ever sent, so the callback's
/// `blocking_send` finds it empty and returns without waiting.
async fn answered<T: Send + 'static>(open: impl FnOnce(Sender<Option<T>>)) -> Option<T> {
    let (sender, mut receiver) = tauri::async_runtime::channel(1);

    open(sender);

    receiver.recv().await.flatten()
}

fn as_string(chosen: FilePath) -> Option<String> {
    chosen
        .into_path()
        .ok()
        .map(|path| path.display().to_string())
}

/// Asks the person to choose a vault folder.
///
/// Returns `None` when they cancel, which is not a failure and must not be reported as
/// one. Nothing here validates the choice: whether the folder can serve as a vault is
/// `VaultRoot::open`'s decision, and duplicating that check would mean two answers to one
/// question.
#[tauri::command]
pub async fn pick_vault_directory(app: AppHandle) -> Option<String> {
    answered(|sender| {
        app.dialog()
            .file()
            .set_title("Choose a vault folder")
            .pick_folder(move |chosen| {
                // Dropped if the receiver is gone, which happens only if the window closed
                // while the sheet was open. Nothing to report in that case.
                let _ = sender.blocking_send(chosen);
            });
    })
    .await
    .and_then(as_string)
}

/// Asks the person to choose a lecture document to import.
///
/// The filter is a convenience, not a check: the importer decides what it can take, and a
/// file that slips past this still gets a proper answer from it rather than a surprise.
#[tauri::command]
pub async fn pick_document(app: AppHandle) -> Option<String> {
    answered(|sender| {
        app.dialog()
            .file()
            .set_title("Choose a document")
            .add_filter("Documents", &IMPORTABLE)
            .pick_file(move |chosen| {
                let _ = sender.blocking_send(chosen);
            });
    })
    .await
    .and_then(as_string)
}
