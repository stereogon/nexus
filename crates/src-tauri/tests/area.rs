//! Contract tests for `add_area_highlight`, against a real filesystem.
//!
//! A box drawn around a diagram, an equation or a scanned region — the parts of a slide
//! with no text to select. Driven through the blocking half with `SequentialIds` and a
//! `FixedClock`, so the stored shape can be asserted exactly.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;

use lecture_core::{
    Annotation, FixedClock, HighlightSemantic, RelativePath, SequentialIds, Timestamp,
};
use lecture_fs::{AtomicFsStorage, VaultRoot};
use nexus_app::annotations::{
    NewArea, erase_annotation, read_annotations, rewrite_semantic, write_area,
};
use tempfile::TempDir;

const BUNDLE: &str = "cs454/raft-consensus";
const MADE: &str = "2026-11-05T10:00:00Z";

fn vault() -> TempDir {
    let dir = TempDir::new().unwrap();
    let storage = AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap());
    storage
        .create_dir(&RelativePath::parse(BUNDLE).unwrap())
        .unwrap();

    dir
}

fn clock() -> FixedClock {
    FixedClock::new(Timestamp::parse(MADE).unwrap())
}

/// An area as the window sends it, parsed from JSON so the boundary itself is exercised.
fn area(json: &str) -> Result<NewArea, serde_json::Error> {
    serde_json::from_str(json)
}

const DIAGRAM: &str =
    r#"{"page":2,"semantic":"definition","region":{"x":0.1,"y":0.3,"width":0.5,"height":0.4}}"#;

#[test]
fn a_drawn_box_is_stored_as_an_area_highlight() {
    let dir = vault();
    let root = dir.path().to_str().unwrap();

    let made = write_area(
        root,
        BUNDLE,
        area(DIAGRAM).unwrap(),
        &SequentialIds::new("ar-"),
        &clock(),
    )
    .unwrap();

    let Annotation::AreaHighlight {
        page,
        semantic,
        region,
        caption,
        ..
    } = &made
    else {
        panic!("expected an area highlight, got {made:?}");
    };

    assert_eq!(page.get(), 2);
    assert_eq!(*semantic, HighlightSemantic::Definition);
    assert_eq!(
        (region.x(), region.y(), region.width(), region.height()),
        (0.1, 0.3, 0.5, 0.4)
    );
    assert_eq!(
        caption, &None,
        "a box is drawn around something with no text to quote"
    );
    assert_eq!(made.created_at(), &Timestamp::parse(MADE).unwrap());
}

#[test]
fn a_stored_area_comes_back_on_the_next_load() {
    let dir = vault();
    let root = dir.path().to_str().unwrap();

    let made = write_area(
        root,
        BUNDLE,
        area(DIAGRAM).unwrap(),
        &SequentialIds::new("ar-"),
        &clock(),
    )
    .unwrap();

    assert_eq!(read_annotations(root, BUNDLE).unwrap(), vec![made]);
}

#[test]
fn a_box_reaching_past_the_page_is_refused_at_the_boundary() {
    // §3: geometry is normalised to the page, so a region past its edge is a bug in the
    // window, refused before anything is built.
    let past =
        area(r#"{"page":1,"semantic":"key","region":{"x":0.8,"y":0.1,"width":0.4,"height":0.2}}"#);

    assert!(past.is_err());
}

#[test]
fn page_zero_is_refused_without_touching_the_file() {
    let dir = vault();
    let root = dir.path().to_str().unwrap();
    let zero =
        area(r#"{"page":0,"semantic":"key","region":{"x":0.1,"y":0.1,"width":0.2,"height":0.2}}"#)
            .unwrap();

    assert!(write_area(root, BUNDLE, zero, &SequentialIds::new("ar-"), &clock()).is_err());
    assert!(!dir.path().join(BUNDLE).join("annotations.json").exists());
}

#[test]
fn an_area_can_be_re_marked_and_removed_like_any_highlight() {
    // The badge menu treats every highlight alike, so the commands behind it must too.
    let dir = vault();
    let root = dir.path().to_str().unwrap();
    let made = write_area(
        root,
        BUNDLE,
        area(DIAGRAM).unwrap(),
        &SequentialIds::new("ar-"),
        &clock(),
    )
    .unwrap();

    let changed = rewrite_semantic(
        root,
        BUNDLE,
        made.id().as_str(),
        HighlightSemantic::Exam,
        &clock(),
    )
    .unwrap()
    .unwrap();
    assert_eq!(changed.semantic(), Some(HighlightSemantic::Exam));
    assert_eq!(changed.id(), made.id());

    assert!(
        erase_annotation(root, BUNDLE, made.id().as_str())
            .unwrap()
            .is_some()
    );
    assert_eq!(read_annotations(root, BUNDLE).unwrap(), vec![]);
    assert!(fs::metadata(dir.path().join(BUNDLE).join("annotations.json")).is_ok());
}
