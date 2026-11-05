//! Contract tests for `retag_annotation`, against a real filesystem.
//!
//! Changing what a highlight means — key to exam — while keeping its id, because the id
//! is what `cite://<id>` in the notes points at. Driven through the blocking half with a
//! `FixedClock`, so the stored instant can be asserted exactly.
//!
//! "Rewrites nothing" is checked by inode rather than by modification time. Every save is
//! an atomic temp-file-and-rename, so a rewrite always produces a new inode; comparing
//! inodes catches one whatever the filesystem's clock resolution.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::os::unix::fs::MetadataExt;

use lecture_core::{
    Annotation, FixedClock, HighlightSemantic, RelativePath, SequentialIds, Timestamp,
};
use lecture_fs::{AtomicFsStorage, VaultRoot};
use nexus_app::annotations::{NewHighlight, read_annotations, rewrite_semantic, write_highlight};
use tempfile::TempDir;

const BUNDLE: &str = "cs454/raft-consensus";
const MADE: &str = "2026-10-27T16:00:00Z";
const LATER: &str = "2026-11-05T09:30:00Z";

fn vault() -> TempDir {
    let dir = TempDir::new().unwrap();
    let storage = AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap());
    storage
        .create_dir(&RelativePath::parse(BUNDLE).unwrap())
        .unwrap();

    dir
}

fn clock(at: &str) -> FixedClock {
    FixedClock::new(Timestamp::parse(at).unwrap())
}

/// A vault holding one key-concept highlight, and the highlight as stored.
fn with_one_highlight() -> (TempDir, Annotation) {
    let dir = vault();
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
        &clock(MADE),
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
fn a_retag_keeps_the_id_and_changes_the_meaning() {
    let (dir, made) = with_one_highlight();
    let root = dir.path().to_str().unwrap();

    let changed = rewrite_semantic(
        root,
        BUNDLE,
        made.id().as_str(),
        HighlightSemantic::Exam,
        &clock(LATER),
    )
    .unwrap()
    .unwrap();

    assert_eq!(changed.id(), made.id());
    assert_eq!(changed.semantic(), Some(HighlightSemantic::Exam));
    assert_eq!(changed.created_at(), made.created_at());
    assert_eq!(changed.updated_at(), &Timestamp::parse(LATER).unwrap());
}

#[test]
fn a_retag_is_on_disk_for_the_next_load() {
    let (dir, made) = with_one_highlight();
    let root = dir.path().to_str().unwrap();

    rewrite_semantic(
        root,
        BUNDLE,
        made.id().as_str(),
        HighlightSemantic::Question,
        &clock(LATER),
    )
    .unwrap();

    let loaded = read_annotations(root, BUNDLE).unwrap();

    let [only] = loaded.as_slice() else {
        panic!("expected exactly one annotation, found {}", loaded.len());
    };

    assert_eq!(only.id(), made.id());
    assert_eq!(only.semantic(), Some(HighlightSemantic::Question));
}

#[test]
fn choosing_the_colour_it_already_has_rewrites_nothing() {
    // An ordinary misclick. A write that changes nothing is still a write every sync
    // client has to reconcile.
    let (dir, made) = with_one_highlight();
    let root = dir.path().to_str().unwrap();
    let before = inode(&dir);

    let answered = rewrite_semantic(
        root,
        BUNDLE,
        made.id().as_str(),
        HighlightSemantic::Key,
        &clock(LATER),
    )
    .unwrap();

    assert_eq!(answered, Some(made));
    assert_eq!(
        inode(&dir),
        before,
        "an unchanged highlight must not rewrite the file"
    );
}

#[test]
fn retagging_something_already_gone_is_not_an_error_and_rewrites_nothing() {
    // Removed on another device between the click and the command, say.
    let (dir, _) = with_one_highlight();
    let root = dir.path().to_str().unwrap();
    let before = inode(&dir);

    let answered = rewrite_semantic(
        root,
        BUNDLE,
        "hl-not-here",
        HighlightSemantic::Exam,
        &clock(LATER),
    )
    .unwrap();

    assert_eq!(answered, None);
    assert_eq!(
        inode(&dir),
        before,
        "a retag that changed nothing must not rewrite the file"
    );
}

#[test]
fn a_retag_does_rewrite_the_file() {
    // The other side of the two checks above, so they cannot pass because no retag ever
    // writes at all.
    let (dir, made) = with_one_highlight();
    let root = dir.path().to_str().unwrap();
    let before = inode(&dir);

    rewrite_semantic(
        root,
        BUNDLE,
        made.id().as_str(),
        HighlightSemantic::Exam,
        &clock(LATER),
    )
    .unwrap();

    assert_ne!(inode(&dir), before);
}

#[test]
fn an_unusable_id_is_refused_rather_than_treated_as_absent() {
    let (dir, _) = with_one_highlight();
    let root = dir.path().to_str().unwrap();

    let refused = rewrite_semantic(root, BUNDLE, "", HighlightSemantic::Exam, &clock(LATER));

    assert!(refused.is_err());
}
