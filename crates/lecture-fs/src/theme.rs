//! Which theme this device is set to.
//!
//! `~/Library/Application Support/Nexus/theme.txt`, beside [`crate::last_vault`] and for
//! the same reasons: §3 puts per-device state outside the vault, and a theme is as personal
//! to a machine as which vault it had open. A laptop set to dark and a tablet left on the
//! system theme are not in conflict, so there is nothing for a sync client to reconcile.
//!
//! One word of text rather than JSON, as with `last-vault.txt`: one value, no schema to
//! version, nothing to grow into an envelope.

use std::path::Path;
use std::str::FromStr;

use lecture_core::{CoreError, Theme};

use crate::device_state::state_base;
use crate::error::io_error;
use crate::logging;
use crate::storage::AtomicFsStorage;
use crate::vault_root::VaultRoot;

/// Names the theme to use on launch.
pub const THEME_FILE_NAME: &str = "theme.txt";

fn file_path() -> Result<lecture_core::RelativePath, CoreError> {
    lecture_core::RelativePath::parse(THEME_FILE_NAME)
}

/// Records `theme` for this device, under `base`.
///
/// # Errors
///
/// Returns [`CoreError::Io`] if `base` cannot be created or the write fails.
pub fn remember(base: &Path, theme: Theme) -> Result<(), CoreError> {
    std::fs::create_dir_all(base)
        .map_err(|e| io_error("create the app support folder", base, e))?;

    let storage = AtomicFsStorage::new(VaultRoot::open(base)?);

    storage.write(&file_path()?, format!("{theme}\n").as_bytes())
}

/// The theme recorded for this device, or [`Theme::System`].
///
/// Infallible by design, like [`crate::last_vault::recall`]. Nothing recorded, a file that
/// will not read, and a file somebody hand-edited all have the same sensible answer, which
/// is to follow the operating system. Refusing to start over a preference file would be
/// absurd.
///
/// A value that is present but unreadable *is* recorded in the log, because that one is a
/// real difference from "never chose" and would otherwise look like the setting silently
/// not sticking.
#[must_use]
pub fn recall(base: &Path) -> Theme {
    let Ok(root) = VaultRoot::open(base) else {
        return Theme::System;
    };
    let storage = AtomicFsStorage::new(root);
    let Ok(path) = file_path() else {
        return Theme::System;
    };
    let Ok(bytes) = storage.read(&path) else {
        return Theme::System;
    };
    let Ok(text) = String::from_utf8(bytes) else {
        return Theme::System;
    };

    match Theme::from_str(text.trim()) {
        Ok(theme) => theme,
        Err(error) => {
            logging::failure("read the theme preference", &error);

            Theme::System
        }
    }
}

/// Records `theme` in the real Application Support directory.
///
/// # Errors
///
/// As [`remember`], plus [`CoreError::HomeDirectoryUnavailable`] if `HOME` is unset.
pub fn remember_for_this_device(theme: Theme) -> Result<(), CoreError> {
    let home = std::env::var_os("HOME").ok_or(CoreError::HomeDirectoryUnavailable)?;

    remember(&state_base(Path::new(&home)), theme)
}

/// The theme for this device, from the real Application Support directory.
#[must_use]
pub fn recall_for_this_device() -> Theme {
    match std::env::var_os("HOME") {
        Some(home) => recall(&state_base(Path::new(&home))),
        None => Theme::System,
    }
}
