//! Contract tests for `restore_annotation`, which undoing a removal relies on.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use std::fs;
use std::os::unix::fs::MetadataExt;

use lecture_core::{
    Annotation, FixedClock, HighlightSemantic, RelativePath, SequentialIds, Timestamp,
};
use lecture_fs::{AtomicFsStorage, VaultRoot};
use nexus_app::annotations::{
    NewHighlight, erase_annotation, put_back, read_annotations, write_highlight,
};
use tempfile::TempDir;

const BUNDLE: &str = "cs454/raft-consensus";

fn with_one_highlight() -> (TempDir, Annotation) {
    let dir = TempDir::new().unwrap();
    AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap())
        .create_dir(&RelativePath::parse(BUNDLE).unwrap())
        .unwrap();

    let made = write_highlight(
        dir.path().to_str().unwrap(),
        BUNDLE,
        NewHighlight {
            page: 4,
            semantic: HighlightSemantic::Key,
            quote: "Raft achieves consensus via an elected leader.".to_owned(),
            rects: vec![
                serde_json::from_str(r#"{"x":0.14,"y":0.28,"width":0.61,"height":0.03}"#).unwrap(),
            ],
        },
        &SequentialIds::new("hl-"),
        &FixedClock::new(Timestamp::parse("2026-10-27T16:00:00Z").unwrap()),
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
fn a_removed_highlight_comes_back_exactly_as_it_was() {
    // The same id above all: `cite://<id>` in the notes points at it.
    let (dir, made) = with_one_highlight();
    let root = dir.path().to_str().unwrap();
    erase_annotation(root, BUNDLE, made.id().as_str()).unwrap();

    let restored = put_back(root, BUNDLE, made.clone()).unwrap();

    assert_eq!(restored, made);
    assert_eq!(read_annotations(root, BUNDLE).unwrap(), vec![made]);
}

#[test]
fn one_already_there_is_answered_without_a_write() {
    let (dir, made) = with_one_highlight();
    let root = dir.path().to_str().unwrap();
    let before = inode(&dir);

    // A copy that differs, to show the held one is what comes back.
    let mut json = serde_json::to_value(&made).unwrap();
    json["semantic"] = "exam".into();
    let different: Annotation = serde_json::from_value(json).unwrap();

    assert_eq!(put_back(root, BUNDLE, different).unwrap(), made);
    assert_eq!(inode(&dir), before);
}

#[test]
fn a_restore_does_not_disturb_the_others() {
    let (dir, made) = with_one_highlight();
    let root = dir.path().to_str().unwrap();
    let mut json = serde_json::to_value(&made).unwrap();
    json["id"] = "hl-elsewhere".into();
    json["page"] = 1.into();
    let other: Annotation = serde_json::from_value(json).unwrap();

    put_back(root, BUNDLE, other.clone()).unwrap();

    let loaded = read_annotations(root, BUNDLE).unwrap();
    assert_eq!(loaded.len(), 2);
    assert!(loaded.contains(&made));
    assert!(loaded.contains(&other));
}

#[test]
fn an_impossible_annotation_cannot_even_arrive() {
    // What the window sends is deserialised into the validated types before the command
    // body runs, so a rectangle off the page is refused at the boundary.
    let (_dir, made) = with_one_highlight();
    let mut json = serde_json::to_value(&made).unwrap();
    json["rects"][0]["x"] = 1.5.into();

    assert!(serde_json::from_value::<Annotation>(json).is_err());
}
