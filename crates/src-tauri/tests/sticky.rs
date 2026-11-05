//! Contract tests for sticky notes — `add_text_box` and `edit_text_box` — against a real
//! filesystem.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::os::unix::fs::MetadataExt;

use lecture_core::{Annotation, FixedClock, RelativePath, SequentialIds, Timestamp};
use lecture_fs::{AtomicFsStorage, VaultRoot};
use nexus_app::annotations::{
    NewTextBox, TextBoxEdit, erase_annotation, read_annotations, rewrite_text_box, write_text_box,
};
use tempfile::TempDir;

const BUNDLE: &str = "cs454/raft-consensus";

fn vault() -> TempDir {
    let dir = TempDir::new().unwrap();
    AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap())
        .create_dir(&RelativePath::parse(BUNDLE).unwrap())
        .unwrap();
    dir
}

fn clock(at: &str) -> FixedClock {
    FixedClock::new(Timestamp::parse(at).unwrap())
}

fn note(text: &str) -> NewTextBox {
    serde_json::from_value(serde_json::json!({
        "page": 4,
        "region": { "x": 0.6, "y": 0.2, "width": 0.25, "height": 0.15 },
        "text": text,
    }))
    .unwrap()
}

fn edit(json: serde_json::Value) -> TextBoxEdit {
    serde_json::from_value(json).unwrap()
}

/// A vault holding one sticky note, and the note as stored.
fn with_one() -> (TempDir, Annotation) {
    let dir = vault();
    let made = write_text_box(
        dir.path().to_str().unwrap(),
        BUNDLE,
        &note("Ask about the leader lease"),
        &SequentialIds::new("tb-"),
        &clock("2026-11-05T10:00:00Z"),
    )
    .unwrap();

    (dir, made)
}

fn inode(dir: &TempDir) -> u64 {
    fs::metadata(dir.path().join(BUNDLE).join("annotations.json"))
        .unwrap()
        .ino()
}

#[test]
fn a_sticky_note_is_stored_as_a_text_box_and_comes_back() {
    let (dir, made) = with_one();
    let root = dir.path().to_str().unwrap();

    let Annotation::TextBox { page, text, .. } = &made else {
        panic!("expected a text box, got {made:?}");
    };

    assert_eq!(page.get(), 4);
    assert_eq!(text.as_str(), "Ask about the leader lease");
    assert_eq!(read_annotations(root, BUNDLE).unwrap(), vec![made]);
}

#[test]
fn a_note_with_no_words_is_refused_without_touching_the_file() {
    let dir = vault();

    let refused = write_text_box(
        dir.path().to_str().unwrap(),
        BUNDLE,
        &note("   "),
        &SequentialIds::new("tb-"),
        &clock("2026-11-05T10:00:00Z"),
    );

    assert!(refused.is_err());
    assert!(!dir.path().join(BUNDLE).join("annotations.json").exists());
}

#[test]
fn moving_a_note_keeps_its_words_and_its_id() {
    let (dir, made) = with_one();
    let root = dir.path().to_str().unwrap();

    let moved = rewrite_text_box(
        root,
        BUNDLE,
        made.id().as_str(),
        &edit(serde_json::json!({ "region": { "x": 0.1, "y": 0.7, "width": 0.3, "height": 0.2 } })),
        &clock("2026-11-05T11:00:00Z"),
    )
    .unwrap()
    .unwrap();

    assert_eq!(moved.id(), made.id());
    assert_eq!(moved.text(), made.text());
    assert!((moved.bounding_rect().unwrap().x() - 0.1).abs() < 1e-12);
    assert_eq!(
        moved.updated_at(),
        &Timestamp::parse("2026-11-05T11:00:00Z").unwrap()
    );
}

#[test]
fn rewording_a_note_keeps_where_it_is() {
    let (dir, made) = with_one();
    let root = dir.path().to_str().unwrap();

    let reworded = rewrite_text_box(
        root,
        BUNDLE,
        made.id().as_str(),
        &edit(serde_json::json!({ "text": "Lease = 2 × election timeout" })),
        &clock("2026-11-05T11:00:00Z"),
    )
    .unwrap()
    .unwrap();

    assert_eq!(
        reworded.text().unwrap().as_str(),
        "Lease = 2 × election timeout"
    );
    assert_eq!(
        reworded.bounding_rect().unwrap(),
        made.bounding_rect().unwrap()
    );
    assert_eq!(read_annotations(root, BUNDLE).unwrap(), vec![reworded]);
}

#[test]
fn rewording_to_nothing_is_refused_and_rewrites_nothing() {
    let (dir, made) = with_one();
    let before = inode(&dir);

    let refused = rewrite_text_box(
        dir.path().to_str().unwrap(),
        BUNDLE,
        made.id().as_str(),
        &edit(serde_json::json!({ "text": "" })),
        &clock("2026-11-05T11:00:00Z"),
    );

    assert!(refused.is_err());
    assert_eq!(inode(&dir), before);
}

#[test]
fn editing_a_note_that_is_gone_is_not_an_error_and_rewrites_nothing() {
    let (dir, made) = with_one();
    let root = dir.path().to_str().unwrap();
    erase_annotation(root, BUNDLE, made.id().as_str()).unwrap();
    let before = inode(&dir);

    let answered = rewrite_text_box(
        root,
        BUNDLE,
        made.id().as_str(),
        &edit(serde_json::json!({ "text": "x" })),
        &clock("2026-11-05T11:00:00Z"),
    )
    .unwrap();

    assert_eq!(answered, None);
    assert_eq!(inode(&dir), before);
}
