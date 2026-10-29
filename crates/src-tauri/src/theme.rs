//! Reading and recording which theme this device uses.
//!
//! Two commands, matching `remember_vault` / `last_vault`: the store is per-device state
//! outside the vault (§3), and the window asks for it on launch and writes it back when
//! the person changes it.

use std::str::FromStr;

use lecture_core::Theme;
use lecture_fs::{logging, theme};

/// The theme this device is set to, as the name the UI uses.
///
/// Infallible: every way of failing to read a preference has the same answer, which is to
/// follow the system. See `lecture_fs::theme::recall`.
#[tauri::command]
#[must_use]
pub fn last_theme() -> String {
    theme::recall_for_this_device().name().to_owned()
}

/// Records the chosen theme.
///
/// Infallible for the same reason `remember_vault` is: the theme has already been applied
/// in the window, so failing to write the preference costs the choice on the *next*
/// launch, and interrupting someone to say so would be out of all proportion. The failure
/// is logged by code.
#[tauri::command]
pub fn remember_theme(name: &str) {
    match Theme::from_str(name) {
        Ok(chosen) => {
            if let Err(error) = theme::remember_for_this_device(chosen) {
                logging::failure("record the theme preference", &error);
            }
        }
        Err(error) => logging::failure("understand the chosen theme", &error),
    }
}
