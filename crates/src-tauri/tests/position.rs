//! Where this device was in each lecture, through the commands' testable halves, with the
//! store under a temporary folder — no test writes to the real Application Support.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use lecture_core::LectureView;
use lecture_fs::{DeviceStateStore, VaultRoot};
use nexus_app::position::{last_in, position_in, record};
use tempfile::TempDir;

fn view(json: &str) -> LectureView {
    serde_json::from_str(json).unwrap()
}

/// A vault and a device-state folder, both temporary.
fn store() -> (TempDir, TempDir, DeviceStateStore) {
    let vault = TempDir::new().unwrap();
    let base = TempDir::new().unwrap();
    let store =
        DeviceStateStore::under(base.path(), &VaultRoot::open(vault.path()).unwrap()).unwrap();

    (vault, base, store)
}

#[test]
fn a_position_comes_back_for_its_lecture() {
    let (_vault, _base, store) = store();

    record(&store, "week-2/raft", view(r#"{"page":7,"offset":0.25}"#)).unwrap();

    let back = position_in(&store, "week-2/raft").unwrap();
    assert_eq!(back.page().get(), 7);
    assert!((back.offset().fraction() - 0.25).abs() < f64::EPSILON);
}

#[test]
fn a_lecture_never_opened_has_no_position() {
    let (_vault, _base, store) = store();

    assert!(position_in(&store, "week-2/raft").is_none());
}

#[test]
fn the_last_lecture_recorded_is_the_one_open() {
    let (_vault, _base, store) = store();

    record(&store, "week-1/intro", view(r#"{"page":1}"#)).unwrap();
    record(&store, "week-2/raft", view(r#"{"page":3}"#)).unwrap();

    assert_eq!(last_in(&store).as_deref(), Some("week-2/raft"));
    // Each keeps its own place.
    assert_eq!(position_in(&store, "week-1/intro").unwrap().page().get(), 1);
}

#[test]
fn a_position_the_window_could_not_have_sent_is_refused_at_the_boundary() {
    // Page 0, an offset past the page: the types check themselves as they are read.
    assert!(serde_json::from_str::<LectureView>(r#"{"page":0}"#).is_err());
    assert!(serde_json::from_str::<LectureView>(r#"{"page":2,"offset":1.5}"#).is_err());
}

#[test]
fn a_path_outside_the_vault_is_not_recorded() {
    let (_vault, _base, store) = store();

    assert!(record(&store, "../elsewhere", view(r#"{"page":1}"#)).is_err());
    assert!(last_in(&store).is_none());
}
