//! Where this device was in each lecture, and which lecture it had open.
//!
//! Per-device state (§3), kept in Application Support by `DeviceStateStore`, never in the
//! vault: two devices at different pages of one lecture is correct, not a conflict. Losing
//! it costs a scroll position, so failing to read it answers "nowhere yet", and failing to
//! write it is logged by code rather than shown — the reading has already happened.
//!
//! The zoom `LectureView` also holds is not restored yet: it is a factor, and cannot say
//! "fit width", so restoring it would pin a zoom the person never chose.

use std::path::Path;

use lecture_core::{LectureView, RelativePath};
use lecture_fs::{DeviceStateStore, VaultRoot, logging};

/// Where this device last was in a lecture, or `None` if it has not opened it.
#[tauri::command]
#[must_use]
pub fn lecture_position(vault: &str, directory: &str) -> Option<LectureView> {
    let store = store(vault)?;

    position_in(&store, directory)
}

/// Records where this device is in a lecture, and that it is the one open.
#[tauri::command]
pub fn remember_position(vault: &str, directory: &str, view: LectureView) {
    let Some(store) = store(vault) else {
        return;
    };

    if let Err(error) = record(&store, directory, view) {
        logging::failure("record the reading position", &error);
    }
}

/// The lecture this device last had open in the vault, if it still has one.
#[tauri::command]
#[must_use]
pub fn last_lecture(vault: &str) -> Option<String> {
    let store = store(vault)?;

    last_in(&store)
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

/// The testable half of [`lecture_position`].
#[must_use]
pub fn position_in(store: &DeviceStateStore, directory: &str) -> Option<LectureView> {
    store
        .load()
        .position_in(&RelativePath::parse(directory).ok()?)
}

/// The testable half of [`remember_position`].
///
/// # Errors
///
/// Returns a `CoreError` if `directory` is not a path inside a vault or the write fails.
pub fn record(
    store: &DeviceStateStore,
    directory: &str,
    view: LectureView,
) -> Result<(), lecture_core::CoreError> {
    let mut state = store.load();

    state.remember(&RelativePath::parse(directory)?, view);
    store.save(&state)
}

/// The testable half of [`last_lecture`].
#[must_use]
pub fn last_in(store: &DeviceStateStore) -> Option<String> {
    store.load().last_opened().map(ToString::to_string)
}
