//! The desktop shell's entry point.
//!
//! `CLAUDE.md` §3: this crate is a thin IPC adapter and nothing else.

// A desktop app should not open a console window behind itself on Windows. Harmless on
// macOS, and kept so the attribute does not have to be rediscovered later.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::ExitCode;

fn main() -> ExitCode {
    if nexus_app::run().is_err() {
        // A fixed sentence rather than the error's own text, which is the §4 rule: a message
        // that may interpolate a path must not reach a log or a console. This failure also
        // happens before there is a window, so there is nowhere else for it to go.
        //
        // The trade is real and recorded in PROGRESS.md -- the underlying `tauri::Error` is
        // dropped, so this is not diagnosable beyond "the shell would not start". If that
        // ever needs fixing, the answer is a redacting conversion in the shape of
        // `CoreError::log_digest`, not interpolating `Display`.
        eprintln!(
            "Nexus could not create its window. This usually means the app bundle is \
             incomplete; reinstalling it is the fastest fix."
        );

        return ExitCode::FAILURE;
    }

    ExitCode::SUCCESS
}
