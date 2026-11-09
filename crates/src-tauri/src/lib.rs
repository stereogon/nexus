//! A thin IPC adapter over `lecture-core` and its adapters.
//!
//! `CLAUDE.md` §3 says this crate holds **no business logic**. Every command reads as
//! "deserialize, call one thing, serialize"; a command that starts making decisions is a
//! sign those decisions belong in `lecture-core`.
//!
//! It is also the only crate in the workspace allowed to know Tauri exists, and the only
//! one not required to compile for `aarch64-apple-ios`.

pub mod annotations;
pub mod assets;
pub mod document;
pub mod dropped_image;
pub mod edit;
pub mod folder_move;
pub mod folders;
pub mod import;
pub mod layout;
pub mod notes;
pub mod notice;
pub mod picker;
pub mod position;
pub mod reorganize;
pub mod search;
pub mod theme;
pub mod trash;
pub mod vault;

pub use annotations::{
    add_area_highlight, add_highlight, add_text_box, edit_text_box, load_annotations,
    remove_annotation, restore_annotation, retag_annotation,
};
pub use document::open_document;
pub use edit::edit_lecture;
pub use import::{import_document, importable_formats};
pub use layout::{last_pane_width, remember_pane_width};
pub use picker::{pick_document, pick_vault_directory};
pub use reorganize::{apply_reorganize, preview_reorganize};
pub use theme::{last_theme, remember_theme};
pub use vault::{
    CommandError, LectureRow, ProblemRow, VaultSummary, last_vault, open_vault, remember_vault,
};

/// Starts the desktop application, returning when the last window closes.
///
/// # Errors
///
/// Returns [`tauri::Error`] if the webview cannot be created or the generated context is
/// unusable. Propagated rather than unwrapped: §4 bans `.expect()` in production code with
/// no carve-out for "it cannot really happen", and the caller can at least set an exit code
/// and say something.
pub fn run() -> Result<(), tauri::Error> {
    start_logging();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_vault,
            open_document,
            load_annotations,
            add_highlight,
            add_area_highlight,
            add_text_box,
            edit_text_box,
            remove_annotation,
            retag_annotation,
            restore_annotation,
            notes::load_notes,
            notes::save_notes,
            assets::save_asset,
            dropped_image::save_dropped_image,
            remember_vault,
            last_theme,
            remember_theme,
            last_pane_width,
            remember_pane_width,
            position::lecture_position,
            position::remember_position,
            position::last_lecture,
            last_vault,
            pick_vault_directory,
            pick_document,
            import_document,
            importable_formats,
            edit_lecture,
            folders::create_folder,
            folders::create_note,
            folders::move_item,
            folder_move::move_folder,
            notice::notice_quiet,
            notice::quiet_notice,
            trash::delete_item,
            preview_reorganize,
            apply_reorganize,
            search::search_vault,
            search::vault_highlights
        ])
        .run(tauri::generate_context!())
}

/// Opens the log file, before anything exists that could need it.
///
/// Nothing called this until 2026-10-28, so the shipped app wrote **no log at all** while
/// `PROGRESS.md` recorded logging as wired. The cost showed up the first time it mattered: a
/// converter crash had to be diagnosed from a macOS crash report, because
/// `~/Library/Logs/Nexus/` did not exist.
///
/// A failure to start logging is deliberately **not** fatal. Running without a log is bad;
/// refusing to open someone's vault because a log file would not open is worse. The sentence
/// carries no path, per §4, and goes to stderr because there is by definition nowhere else.
fn start_logging() {
    if lecture_fs::logging::start_for_this_device().is_err() {
        eprintln!("Nexus could not open its log file, and is continuing without one.");
    }
}
