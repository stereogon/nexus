//! Whether a document's screening notice is shown on this device (2026-11-09): asked not
//! to be shown again, it stays quiet for that document. Per-device state, beside the
//! reading positions in `DeviceStateStore`, never in the vault.

use std::path::Path;

use lecture_core::{CoreError, RelativePath};
use lecture_fs::{DeviceStateStore, VaultRoot, logging};

/// Whether `directory`'s notice was asked not to be shown again. A state that cannot be read
/// answers no: the notice showing once more costs a click, and hiding it wrongly would hide
/// a warning.
#[tauri::command]
#[must_use]
pub fn notice_quiet(vault: &str, directory: &str) -> bool {
    store(vault).is_some_and(|store| is_quiet(&store, directory))
}

/// Stops showing `directory`'s notice on this device.
#[tauri::command]
pub fn quiet_notice(vault: &str, directory: &str) {
    let Some(store) = store(vault) else {
        return;
    };

    if let Err(error) = quiet(&store, directory) {
        logging::failure("record a quieted notice", &error);
    }
}

fn store(vault: &str) -> Option<DeviceStateStore> {
    let root = VaultRoot::open(Path::new(vault)).ok()?;

    match DeviceStateStore::for_vault(&root) {
        Ok(store) => Some(store),
        Err(error) => {
            logging::failure("open this device's view state", &error);
            None
        }
    }
}

/// The testable half of [`notice_quiet`].
#[must_use]
pub fn is_quiet(store: &DeviceStateStore, directory: &str) -> bool {
    RelativePath::parse(directory).is_ok_and(|path| store.load().is_notice_quiet(&path))
}

/// The testable half of [`quiet_notice`].
///
/// # Errors
///
/// Returns a `CoreError` if `directory` is not a path inside a vault or the write fails.
pub fn quiet(store: &DeviceStateStore, directory: &str) -> Result<(), CoreError> {
    let mut state = store.load();

    state.quiet_notice(&RelativePath::parse(directory)?);
    store.save(&state)
}
