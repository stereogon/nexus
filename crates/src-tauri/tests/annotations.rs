//! Contract tests for the annotation commands, against a real filesystem.
//!
//! These drive the blocking halves directly, passing `SequentialIds` and `FixedClock`, so
//! the stored shape can be asserted exactly — which id, which instant — rather than
//! matched loosely against whatever the machine produced during the run.
//!
//! The cases worth having here are the ones about *not* losing work: a highlight that
//! cannot be built must not touch the file, and a remove of something already gone must
//! not rewrite it.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;

use lecture_core::{
    Annotation, FixedClock, HighlightSemantic, IdSource, RelativePath, SequentialIds, Timestamp,
};
use lecture_fs::{AtomicFsStorage, VaultRoot};
use nexus_app::annotations::{NewHighlight, erase_annotation, read_annotations, write_highlight};
use tempfile::TempDir;

const BUNDLE: &str = "cs454/raft-consensus";
const MADE: &str = "2026-10-27T16:00:00Z";

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

fn wanted() -> NewHighlight {
    NewHighlight {
        page: 4,
        semantic: HighlightSemantic::Key,
        quote: "Raft achieves consensus via an elected leader.".to_owned(),
        rects: vec![
            serde_json::from_str(r#"{"x":0.14,"y":0.28,"width":0.61,"height":0.03}"#).unwrap(),
        ],
    }
}

fn path(dir: &TempDir) -> std::path::PathBuf {
    dir.path().join(BUNDLE).join("annotations.json")
}

#[test]
fn a_lecture_with_no_annotations_file_loads_as_empty() {
    // The normal state of anything freshly imported. An error here would make every new
    // lecture look broken.
    let dir = vault();

    assert_eq!(
        read_annotations(dir.path().to_str().unwrap(), BUNDLE).unwrap(),
        vec![]
    );
    assert!(!path(&dir).exists(), "loading must not create the file");
}

#[test]
fn a_stored_highlight_comes_back_on_the_next_load() {
    let dir = vault();
    let root = dir.path().to_str().unwrap();

    let made =
        write_highlight(root, BUNDLE, wanted(), &SequentialIds::new("hl-"), &clock()).unwrap();
    let loaded = read_annotations(root, BUNDLE).unwrap();

    assert_eq!(loaded, vec![made]);
}

#[test]
fn the_stored_annotation_carries_the_id_and_instant_the_ports_gave() {
    let dir = vault();

    let made = write_highlight(
        dir.path().to_str().unwrap(),
        BUNDLE,
        wanted(),
        &SequentialIds::new("hl-"),
        &clock(),
    )
    .unwrap();

    assert_eq!(made.id().as_str(), "hl-1");
    assert_eq!(made.created_at(), &Timestamp::parse(MADE).unwrap());
    // Equal, not merely close: a brand-new annotation has never been changed, and a
    // later `updated_at` would make it look edited.
    assert_eq!(made.created_at(), made.updated_at());
    assert_eq!(made.page().get(), 4);
    assert_eq!(made.semantic(), Some(HighlightSemantic::Key));
}

#[test]
fn two_highlights_on_one_lecture_get_different_ids() {
    let dir = vault();
    let root = dir.path().to_str().unwrap();
    let ids = SequentialIds::new("hl-");

    let first = write_highlight(root, BUNDLE, wanted(), &ids, &clock()).unwrap();
    let second = write_highlight(root, BUNDLE, wanted(), &ids, &clock()).unwrap();

    assert_ne!(first.id(), second.id());
    assert_eq!(read_annotations(root, BUNDLE).unwrap().len(), 2);
}

#[test]
fn a_page_number_of_zero_is_refused_and_writes_nothing() {
    // Pages count from 1, and a zero would come from an off-by-one in the window. The
    // point of the test is the second assertion: a refusal must not leave a file behind.
    let dir = vault();
    let asked = NewHighlight {
        page: 0,
        ..wanted()
    };

    let refused = write_highlight(
        dir.path().to_str().unwrap(),
        BUNDLE,
        asked,
        &SequentialIds::new("hl-"),
        &clock(),
    );

    assert!(refused.is_err());
    assert!(!path(&dir).exists());
}

#[test]
fn a_highlight_covering_no_rectangle_is_refused_and_leaves_the_others_alone() {
    let dir = vault();
    let root = dir.path().to_str().unwrap();
    let ids = SequentialIds::new("hl-");

    let kept = write_highlight(root, BUNDLE, wanted(), &ids, &clock()).unwrap();
    let before = fs::read_to_string(path(&dir)).unwrap();

    let refused = write_highlight(
        root,
        BUNDLE,
        NewHighlight {
            rects: vec![],
            ..wanted()
        },
        &ids,
        &clock(),
    );

    assert!(refused.is_err());
    assert_eq!(
        fs::read_to_string(path(&dir)).unwrap(),
        before,
        "a refused highlight must not rewrite the file"
    );
    assert_eq!(read_annotations(root, BUNDLE).unwrap(), vec![kept]);
}

#[test]
fn a_rectangle_outside_the_page_is_refused_at_the_boundary() {
    // Refused while being deserialised, before any command sees it, which is why this is
    // asserted through serde rather than through a constructor.
    let outside = serde_json::from_str::<NewHighlight>(
        r#"{"page":4,"semantic":"key","quote":"x","rects":[{"x":0.5,"y":0.5,"width":0.9,"height":0.1}]}"#,
    );

    assert!(
        outside.is_err(),
        "a rect running past the right edge must not deserialise"
    );
}

#[test]
fn the_wire_shape_is_the_camel_case_the_window_sends() {
    // The window and this struct are two files that have to agree; `src/ipc/annotations.ts`
    // holds the other half.
    let sent = serde_json::from_str::<NewHighlight>(
        r#"{"page":2,"semantic":"definition","quote":"A quorum is a majority.","rects":[{"x":0.1,"y":0.2,"width":0.3,"height":0.04}]}"#,
    )
    .unwrap();

    assert_eq!(sent.page, 2);
    assert_eq!(sent.semantic, HighlightSemantic::Definition);
}

#[test]
fn removing_a_highlight_removes_it() {
    let dir = vault();
    let root = dir.path().to_str().unwrap();

    let made =
        write_highlight(root, BUNDLE, wanted(), &SequentialIds::new("hl-"), &clock()).unwrap();
    let removed = erase_annotation(root, BUNDLE, made.id().as_str()).unwrap();

    assert_eq!(removed, Some(made));
    assert_eq!(read_annotations(root, BUNDLE).unwrap(), vec![]);
}

#[test]
fn removing_something_already_gone_is_not_an_error_and_rewrites_nothing() {
    let dir = vault();
    let root = dir.path().to_str().unwrap();
    let ids = SequentialIds::new("hl-");

    write_highlight(root, BUNDLE, wanted(), &ids, &clock()).unwrap();
    let before = fs::metadata(path(&dir)).unwrap().modified().unwrap();

    let removed = erase_annotation(root, BUNDLE, "hl-not-here").unwrap();

    assert_eq!(removed, None);
    assert_eq!(
        fs::metadata(path(&dir)).unwrap().modified().unwrap(),
        before,
        "a remove that changed nothing must not rewrite the file"
    );
}

#[test]
fn an_unusable_id_is_refused_rather_than_treated_as_absent() {
    // `cite://<id>` has to mean one thing, so an id with a character needing escaping is
    // an error and not merely a miss -- otherwise a typo reads as "already removed".
    let dir = vault();

    let refused = erase_annotation(dir.path().to_str().unwrap(), BUNDLE, "hl 9f8a/../etc");

    assert!(refused.is_err());
}

#[test]
fn an_annotation_from_an_older_session_survives_a_new_one() {
    // The load-change-save shape exists for this: the window never holds the whole set,
    // so a second highlight cannot drop the first.
    let dir = vault();
    let root = dir.path().to_str().unwrap();

    let first =
        write_highlight(root, BUNDLE, wanted(), &SequentialIds::new("a-"), &clock()).unwrap();
    let second = write_highlight(
        root,
        BUNDLE,
        NewHighlight {
            page: 9,
            ..wanted()
        },
        &SequentialIds::new("b-"),
        &clock(),
    )
    .unwrap();

    let loaded: Vec<Annotation> = read_annotations(root, BUNDLE).unwrap();

    assert!(loaded.contains(&first));
    assert!(loaded.contains(&second));
}

#[test]
fn the_id_source_this_machine_uses_produces_usable_ids() {
    // `SystemIds` is the one path the tests above bypass, so it is checked here: a scheme
    // producing something `AnnotationId` refuses would fail only in the shipped app.
    let ids = lecture_fs::SystemIds::new();

    let first = ids.fresh().unwrap();
    let second = ids.fresh().unwrap();

    assert_ne!(first, second);
    assert!(first.as_str().chars().all(|c| c.is_ascii_hexdigit()));
}
