//! Contract tests for per-device state on a real filesystem.
//!
//! **No test here writes to the real `~/Library`.** Every one passes a temporary base
//! directory to `DeviceStateStore::under`, which is why the location is a parameter. The
//! real location is covered by testing `state_base` as a pure function against a fake
//! home, so the only untested line is the `HOME` lookup itself.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::path::Path;

use lecture_core::{
    LectureView, PageNumber, PageOffset, RelativePath, VIEW_STATE_SCHEMA_VERSION, ViewState, Zoom,
};
use lecture_fs::{APP_SUPPORT_DIR_NAME, DeviceStateStore, VAULTS_DIR_NAME, VaultRoot, state_base};
use tempfile::TempDir;

fn page(number: u32) -> PageNumber {
    PageNumber::new(number).unwrap()
}

fn path(raw: &str) -> RelativePath {
    RelativePath::parse(raw).unwrap()
}

/// A vault and a separate base for state, as the real layout has them.
fn fixture() -> (TempDir, TempDir) {
    (TempDir::new().unwrap(), TempDir::new().unwrap())
}

fn store(base: &Path, vault: &Path) -> DeviceStateStore {
    DeviceStateStore::under(base, &VaultRoot::open(vault).unwrap()).unwrap()
}

/// Finds the one `view-state.json` beneath `base`.
fn state_file(base: &Path) -> std::path::PathBuf {
    let vaults = base.join(VAULTS_DIR_NAME);
    let key = fs::read_dir(&vaults)
        .unwrap()
        .next()
        .expect("a vault folder should exist")
        .unwrap()
        .path();

    key.join("view-state.json")
}

#[test]
fn a_device_that_has_read_nothing_loads_empty() {
    let (vault, base) = fixture();

    assert!(store(base.path(), vault.path()).load().is_empty());
}

#[test]
fn a_saved_position_round_trips() {
    let (vault, base) = fixture();
    let store = store(base.path(), vault.path());

    let mut state = ViewState::empty();
    state.remember(
        &path("cs454/raft"),
        LectureView::new(
            page(40),
            PageOffset::new(0.25).unwrap(),
            Zoom::new(1.5).unwrap(),
        ),
    );
    store.save(&state).unwrap();

    let loaded = store.load();
    let view = loaded.position_in(&path("cs454/raft")).unwrap();
    assert_eq!(view.page().get(), 40);
    assert!((view.offset().fraction() - 0.25).abs() < f64::EPSILON);
    assert!((view.zoom().factor() - 1.5).abs() < f64::EPSILON);
    assert_eq!(loaded.last_opened(), Some(&path("cs454/raft")));
}

/// The decision this whole module exists to honour.
#[test]
fn nothing_is_written_inside_the_vault() {
    let (vault, base) = fixture();
    let store = store(base.path(), vault.path());

    let mut state = ViewState::empty();
    state.remember(&path("cs454/raft"), LectureView::at_page(page(12)));
    store.save(&state).unwrap();

    let left_in_vault: Vec<String> = fs::read_dir(vault.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();

    assert!(
        left_in_vault.is_empty(),
        "per-device state must leave the vault untouched, found {left_in_vault:?}"
    );
}

#[test]
fn two_vaults_keep_separate_positions() {
    // Opening a second vault must not move your place in the first.
    let base = TempDir::new().unwrap();
    let (one, two) = fixture();

    let mut first = ViewState::empty();
    first.remember(&path("cs454/raft"), LectureView::at_page(page(12)));
    store(base.path(), one.path()).save(&first).unwrap();

    let mut second = ViewState::empty();
    second.remember(&path("phys101/optics"), LectureView::at_page(page(3)));
    store(base.path(), two.path()).save(&second).unwrap();

    assert_eq!(
        store(base.path(), one.path())
            .load()
            .position_in(&path("cs454/raft"))
            .unwrap()
            .page()
            .get(),
        12
    );
    assert!(
        store(base.path(), two.path())
            .load()
            .position_in(&path("cs454/raft"))
            .is_none()
    );
}

#[test]
fn the_same_vault_resolves_to_the_same_folder_every_time() {
    // Otherwise a reading position would be orphaned on every launch.
    let (vault, base) = fixture();

    let mut state = ViewState::empty();
    state.remember(&path("cs454/raft"), LectureView::at_page(page(12)));
    store(base.path(), vault.path()).save(&state).unwrap();
    store(base.path(), vault.path()).save(&state).unwrap();

    let folders = fs::read_dir(base.path().join(VAULTS_DIR_NAME))
        .unwrap()
        .count();
    assert_eq!(folders, 1, "one vault must map to exactly one folder");
}

#[test]
fn a_corrupt_state_file_is_discarded_rather_than_preserved() {
    let (vault, base) = fixture();
    let store = store(base.path(), vault.path());
    store.save(&ViewState::empty()).unwrap();

    let file = state_file(base.path());
    fs::write(&file, b"{ truncated").unwrap();

    assert!(store.load().is_empty());
    assert!(
        !file.with_extension("json.bak").exists(),
        "a file holding no work must not leave a backup behind"
    );
}

#[test]
fn a_state_file_from_a_newer_build_is_discarded() {
    let (vault, base) = fixture();
    let store = store(base.path(), vault.path());
    store.save(&ViewState::empty()).unwrap();

    fs::write(
        state_file(base.path()),
        format!(
            r#"{{ "schemaVersion": {}, "lectures": {{}} }}"#,
            VIEW_STATE_SCHEMA_VERSION + 1
        ),
    )
    .unwrap();

    assert!(store.load().is_empty());
}

#[test]
fn records_which_vault_a_folder_belongs_to() {
    // A breadcrumb for a human; the key alone is unidentifiable six months later.
    let (vault, base) = fixture();
    let store = store(base.path(), vault.path());
    store.save(&ViewState::empty()).unwrap();

    let note =
        fs::read_to_string(state_file(base.path()).with_file_name("vault-path.txt")).unwrap();

    assert!(
        note.contains(
            &VaultRoot::open(vault.path())
                .unwrap()
                .path()
                .display()
                .to_string()
        ),
        "the breadcrumb should name the vault, got {note:?}"
    );
}

#[test]
fn state_lives_under_application_support() {
    // Pure, so the real layout is checked without touching a real home directory.
    let base = state_base(Path::new("/Users/someone"));

    assert_eq!(
        base,
        Path::new("/Users/someone/Library/Application Support").join(APP_SUPPORT_DIR_NAME)
    );
}

#[test]
fn saving_creates_the_directories_it_needs() {
    let (vault, base) = fixture();
    let nested = base.path().join("not").join("created").join("yet");

    store(&nested, vault.path())
        .save(&ViewState::empty())
        .unwrap();

    assert!(state_file(&nested).is_file());
}
