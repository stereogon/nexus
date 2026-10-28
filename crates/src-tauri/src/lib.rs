//! A thin IPC adapter over `lecture-core` and its adapters.
//!
//! `CLAUDE.md` §3 says this crate holds **no business logic**. Every command reads as
//! "deserialize, call one thing, serialize"; a command that starts making decisions is a
//! sign those decisions belong in `lecture-core`.
//!
//! It is also the only crate in the workspace allowed to know Tauri exists, and the only
//! one not required to compile for `aarch64-apple-ios`.

pub mod facets;
pub mod import;
pub mod picker;
pub mod reorganize;
pub mod vault;

pub use facets::set_lecture_facets;
pub use import::{import_document, importable_formats};
pub use picker::{pick_document, pick_vault_directory};
pub use reorganize::{apply_reorganize, preview_reorganize};
pub use vault::{CommandError, LectureRow, ProblemRow, VaultSummary, open_vault};

/// Starts the desktop application, returning when the last window closes.
///
/// # Errors
///
/// Returns [`tauri::Error`] if the webview cannot be created or the generated context is
/// unusable. Propagated rather than unwrapped: §4 bans `.expect()` in production code with
/// no carve-out for "it cannot really happen", and the caller can at least set an exit code
/// and say something.
pub fn run() -> Result<(), tauri::Error> {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_vault,
            pick_vault_directory,
            pick_document,
            import_document,
            importable_formats,
            set_lecture_facets,
            preview_reorganize,
            apply_reorganize
        ])
        .run(tauri::generate_context!())
}
