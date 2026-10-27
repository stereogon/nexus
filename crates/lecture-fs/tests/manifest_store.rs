//! Contract tests for [`ManifestStore`], against a real filesystem.
//!
//! The central case is the asymmetry: a *corrupt* manifest is copied aside before
//! anything else, while a manifest from a *newer build* is left strictly untouched.
//! Confusing the two would destroy data an updated Nexus could read perfectly — and on a
//! synced vault that damage would travel back to the device that wrote it.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;

use lecture_core::{
    Conversion, FixedClock, Label, Manifest, OrderKey, RelativePath, Source, Timestamp,
};
use lecture_fs::{AtomicFsStorage, ManifestStore, VaultRoot};
use tempfile::TempDir;

const CREATED: &str = "2026-10-27T16:00:00Z";
const NOW: &str = "2026-10-28T09:30:00Z";

fn label(raw: &str) -> Label {
    Label::parse(raw).unwrap()
}

fn at(raw: &str) -> Timestamp {
    Timestamp::parse(raw).unwrap()
}

fn bundle() -> RelativePath {
    RelativePath::parse("cs454/raft-consensus").unwrap()
}

fn manifest_file() -> RelativePath {
    RelativePath::parse("cs454/raft-consensus/manifest.json").unwrap()
}

fn store() -> (TempDir, ManifestStore<FixedClock>) {
    let dir = TempDir::new().unwrap();
    let root = VaultRoot::open(dir.path()).unwrap();
    let storage = AtomicFsStorage::new(root);
    storage.create_dir(&bundle()).unwrap();

    let clock = FixedClock::new(at(NOW));
    (dir, ManifestStore::new(storage, clock))
}

fn sample() -> Manifest {
    let source = Source::new(
        RelativePath::parse("source/document.pdf").unwrap(),
        Some(RelativePath::parse("source/original.pptx").unwrap()),
        Conversion::ready(label("libreoffice"), at(CREATED)),
    )
    .unwrap();

    Manifest::new(
        label("Raft Consensus"),
        OrderKey::first(),
        source,
        at(CREATED),
    )
}

/// Writes raw bytes straight to the manifest path, bypassing the store.
fn write_raw(dir: &TempDir, contents: &str) {
    fs::write(
        dir.path().join("cs454/raft-consensus/manifest.json"),
        contents,
    )
    .unwrap();
}

#[test]
fn saves_and_loads_a_manifest() {
    let (_dir, store) = store();

    let saved = store.save(&bundle(), &sample()).unwrap();
    let loaded = store.load(&bundle()).unwrap();

    assert_eq!(saved, loaded);
    assert_eq!(loaded.title().as_str(), "Raft Consensus");
}

#[test]
fn saving_stamps_the_change_time_from_the_clock() {
    // The clock is held by the store so that saving cannot forget to do this.
    let (_dir, store) = store();

    let saved = store.save(&bundle(), &sample()).unwrap();

    assert_eq!(saved.created_at().as_str(), CREATED);
    assert_eq!(saved.updated_at().as_str(), NOW);
}

#[test]
fn writes_a_file_a_person_can_read_and_edit() {
    // These files sit in a folder people browse, so they are pretty-printed: one changed
    // field should be one changed line, not an unreadable wall.
    let (dir, store) = store();
    store.save(&bundle(), &sample()).unwrap();

    let written =
        fs::read_to_string(dir.path().join("cs454/raft-consensus/manifest.json")).unwrap();

    assert!(
        written.contains("\n  \"title\": \"Raft Consensus\""),
        "got: {written}"
    );
    assert!(
        written.ends_with('\n'),
        "a text file should end in a newline"
    );
}

#[test]
fn saving_the_same_manifest_twice_produces_identical_bytes() {
    // Determinism matters for sync: a save that changes nothing must not look like a
    // change to a sync client.
    let (dir, store) = store();
    let path = dir.path().join("cs454/raft-consensus/manifest.json");

    let saved = store.save(&bundle(), &sample()).unwrap();
    let first = fs::read(&path).unwrap();
    store.save(&bundle(), &saved).unwrap();
    let second = fs::read(&path).unwrap();

    assert_eq!(first, second);
}

/// The asymmetry this module exists for, half one.
#[test]
fn a_manifest_from_a_newer_build_is_left_completely_alone() {
    let (dir, store) = store();
    let from_future = r#"{"schemaVersion":9,"title":"Raft","whateverComesNext":true}"#;
    write_raw(&dir, from_future);

    let err = store.load(&bundle()).unwrap_err();

    assert_eq!(err.code(), "ERR_MANIFEST_VERSION_UNSUPPORTED");
    assert!(err.remediation().contains("untouched"));

    // Untouched means untouched: same bytes, and no backup written either, because
    // nothing here is damaged.
    let on_disk =
        fs::read_to_string(dir.path().join("cs454/raft-consensus/manifest.json")).unwrap();
    assert_eq!(on_disk, from_future);
    assert!(
        !dir.path()
            .join("cs454/raft-consensus/manifest.json.bak")
            .exists(),
        "a newer manifest is not damaged, so nothing should be copied aside"
    );
}

/// The asymmetry this module exists for, half two.
#[test]
fn a_corrupt_manifest_is_copied_aside_before_anything_else() {
    let (dir, store) = store();
    let broken = r#"{"schemaVersion": 1, "title": "Raft", this is not json"#;
    write_raw(&dir, broken);

    let err = store.load(&bundle()).unwrap_err();

    assert_eq!(err.code(), "ERR_MANIFEST_UNREADABLE");

    let backup = dir.path().join("cs454/raft-consensus/manifest.json.bak");
    assert!(backup.exists(), "the damaged bytes must be preserved");
    assert_eq!(fs::read_to_string(&backup).unwrap(), broken);

    // And the original is still there as well -- nothing was moved or deleted.
    let original =
        fs::read_to_string(dir.path().join("cs454/raft-consensus/manifest.json")).unwrap();
    assert_eq!(original, broken);
}

#[test]
fn an_unreadable_manifest_says_where_the_parser_stopped() {
    // "Could not be read" alone is not something anyone can act on. A line and column
    // turns a broken hand-edit into a ten-second fix.
    let (dir, store) = store();
    write_raw(&dir, "{\n  \"schemaVersion\": 1,\n  \"title\": oops\n}");

    let err = store.load(&bundle()).unwrap_err();
    let message = err.to_string();

    assert!(
        message.contains("line"),
        "should locate the problem: {message}"
    );
    assert!(
        message.contains(".bak"),
        "should say where the copy went: {message}"
    );
}

#[test]
fn an_inconsistent_manifest_is_also_preserved() {
    // Parses as JSON, but claims a finished conversion with no original kept.
    let (dir, store) = store();
    write_raw(
        &dir,
        r#"{"schemaVersion":1,"title":"Raft","sequence":"a0","source":{"document":"source/document.pdf","conversion":{"state":"ready","converter":"libreoffice","convertedAt":"2026-10-27T16:00:00Z"}},"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}"#,
    );

    let err = store.load(&bundle()).unwrap_err();

    assert_eq!(err.code(), "ERR_MANIFEST_UNREADABLE");
    assert!(
        dir.path()
            .join("cs454/raft-consensus/manifest.json.bak")
            .exists()
    );
}

#[test]
fn a_missing_manifest_is_an_io_error_not_a_corrupt_one() {
    // An absent file is not a damaged file, and must not be reported as one.
    let (_dir, store) = store();

    let err = store.load(&bundle()).unwrap_err();
    assert_eq!(err.code(), "ERR_IO");
}

#[test]
fn a_failed_save_leaves_the_previous_manifest_intact() {
    let (dir, store) = store();
    let saved = store.save(&bundle(), &sample()).unwrap();
    let before = fs::read(dir.path().join("cs454/raft-consensus/manifest.json")).unwrap();

    // A clock reading before the bundle was created is refused rather than written.
    let backwards = ManifestStore::new(
        AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap()),
        FixedClock::new(at("2020-01-01T00:00:00Z")),
    );
    let err = backwards.save(&bundle(), &saved).unwrap_err();

    assert_eq!(err.code(), "ERR_INVALID_MANIFEST");
    assert_eq!(
        fs::read(dir.path().join("cs454/raft-consensus/manifest.json")).unwrap(),
        before
    );
}

#[test]
fn refuses_a_bundle_path_that_escapes_the_vault() {
    // The manifest path is derived from the bundle path, so containment carries through
    // rather than being re-checked by hand here.
    let (dir, store) = store();
    let outside = TempDir::new().unwrap();
    std::os::unix::fs::symlink(outside.path(), dir.path().join("escape")).unwrap();

    let err = store
        .load(&RelativePath::parse("escape/lecture").unwrap())
        .unwrap_err();

    assert_eq!(err.code(), "ERR_SYMLINK_REFUSED");
}

#[test]
fn the_manifest_file_is_where_the_bundle_says_it_is() {
    let (dir, store) = store();
    store.save(&bundle(), &sample()).unwrap();

    assert!(
        dir.path()
            .join("cs454/raft-consensus/manifest.json")
            .exists()
    );
    assert!(store.storage().exists(&manifest_file()).unwrap());
}
