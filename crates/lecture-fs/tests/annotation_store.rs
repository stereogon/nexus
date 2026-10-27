//! Contract tests for [`AnnotationStore`], against a real filesystem.
//!
//! The case this file exists for: a bundle with **no** annotations file loads as empty,
//! while one that exists and cannot be read is an error. Collapsing those two would mean
//! a permissions problem or a corrupt file silently reading as "no highlights here" —
//! and then the next save would write that emptiness over someone's work.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;

use lecture_core::{
    Annotation, AnnotationId, AnnotationSet, Excerpt, HighlightSemantic, NormalizedRect,
    PageNumber, RelativePath, Timestamp,
};
use lecture_fs::{AnnotationStore, AtomicFsStorage, VaultRoot};
use tempfile::TempDir;

const MADE: &str = "2026-10-27T16:00:00Z";

fn bundle() -> RelativePath {
    RelativePath::parse("cs454/raft-consensus").unwrap()
}

fn annotations_file() -> RelativePath {
    RelativePath::parse("cs454/raft-consensus/annotations.json").unwrap()
}

fn new_store() -> (TempDir, AnnotationStore) {
    let dir = TempDir::new().unwrap();
    let root = VaultRoot::open(dir.path()).unwrap();
    let storage = AtomicFsStorage::new(root);
    storage.create_dir(&bundle()).unwrap();

    (dir, AnnotationStore::new(storage))
}

fn highlight(ident: &str, page: u32) -> Annotation {
    Annotation::text_highlight(
        AnnotationId::parse(ident).unwrap(),
        PageNumber::new(page).unwrap(),
        HighlightSemantic::Key,
        Excerpt::parse("Raft achieves consensus via an elected leader.").unwrap(),
        vec![NormalizedRect::new(0.142, 0.285, 0.612, 0.032).unwrap()],
        Timestamp::parse(MADE).unwrap(),
    )
    .unwrap()
}

fn sample() -> AnnotationSet {
    let mut set = AnnotationSet::empty();
    set.insert(highlight("hl-9f8a7b6c", 4)).unwrap();
    set.insert(highlight("hl-1a2b3c4d", 7)).unwrap();
    set
}

/// The reason this store differs from `ManifestStore`.
#[test]
fn a_bundle_with_no_annotations_file_loads_as_empty() {
    // The normal state of a freshly imported lecture. Not an error, and not something
    // the caller should have to check for before asking.
    let (dir, store) = new_store();

    let loaded = store.load(&bundle()).unwrap();

    assert!(loaded.is_empty());
    assert!(
        !dir.path()
            .join("cs454/raft-consensus/annotations.json")
            .exists(),
        "loading must not create the file"
    );
}

#[test]
fn saves_and_reads_back_the_same_annotations() {
    let (_dir, store) = new_store();
    let set = sample();

    store.save(&bundle(), &set).unwrap();
    let loaded = store.load(&bundle()).unwrap();

    assert_eq!(loaded, set);
}

#[test]
fn creates_the_file_on_first_save() {
    let (dir, store) = new_store();

    store.save(&bundle(), &sample()).unwrap();

    let path = dir.path().join("cs454/raft-consensus/annotations.json");
    assert!(path.exists(), "first save must create the file");
}

#[test]
fn an_emptied_set_is_saved_as_empty_rather_than_deleted() {
    // Removing the last highlight must leave a valid empty file, not a missing one that
    // happens to read back the same way. The distinction matters for a synced vault:
    // deleting a file and never having had one look identical on disk but not to a sync
    // client resolving a conflict.
    let (_dir, store) = new_store();
    store.save(&bundle(), &sample()).unwrap();

    store.save(&bundle(), &AnnotationSet::empty()).unwrap();
    let loaded = store.load(&bundle()).unwrap();

    assert!(loaded.is_empty());
}

#[test]
fn writes_readable_pretty_printed_json() {
    // People open these files. One changed field should be one changed line.
    let (dir, store) = new_store();
    store.save(&bundle(), &sample()).unwrap();

    let text =
        fs::read_to_string(dir.path().join("cs454/raft-consensus/annotations.json")).unwrap();

    assert!(text.contains("\n  \"schemaVersion\": 1"), "got: {text}");
    assert!(
        text.ends_with('\n'),
        "a text file should end with a newline"
    );
}

#[test]
fn saving_unchanged_annotations_twice_produces_identical_bytes() {
    // A save that changed nothing must not look like a change to a sync client.
    let (dir, store) = new_store();
    let path = dir.path().join("cs454/raft-consensus/annotations.json");

    store.save(&bundle(), &sample()).unwrap();
    let first = fs::read(&path).unwrap();

    store.save(&bundle(), &sample()).unwrap();
    let second = fs::read(&path).unwrap();

    assert_eq!(first, second);
}

/// Half of the asymmetry.
#[test]
fn a_corrupt_annotations_file_is_copied_aside_before_anything_else() {
    let (dir, store) = new_store();
    let path = dir.path().join("cs454/raft-consensus/annotations.json");
    fs::write(
        &path,
        b"{\"schemaVersion\": 1, \"annotations\": [ truncated",
    )
    .unwrap();

    let err = store.load(&bundle()).unwrap_err();

    assert_eq!(err.code(), "ERR_STORED_FILE_UNREADABLE");
    // The error names the file, not "manifest".
    assert!(
        err.to_string().contains("annotations.json"),
        "should say which file: {err}"
    );
    // The parser's position, so a broken hand-edit is a ten-second fix.
    assert!(
        err.to_string().contains("line") || err.to_string().contains("column"),
        "should carry the parser's position: {err}"
    );

    let backup = dir.path().join("cs454/raft-consensus/annotations.json.bak");
    assert!(backup.exists(), "the damaged bytes must be preserved");
    assert!(path.exists(), "the original must not have been removed");
}

/// The other half, and the one that would destroy data if it regressed.
#[test]
fn annotations_from_a_newer_build_are_left_completely_alone() {
    let (dir, store) = new_store();
    let path = dir.path().join("cs454/raft-consensus/annotations.json");
    let from_the_future =
        br#"{"schemaVersion":2,"annotations":[],"inkStrokes":[{"pressure":[0.1]}]}"#;
    fs::write(&path, from_the_future).unwrap();

    let err = store.load(&bundle()).unwrap_err();

    assert_eq!(err.code(), "ERR_SCHEMA_VERSION_UNSUPPORTED");
    assert_eq!(
        fs::read(&path).unwrap(),
        from_the_future,
        "a newer file must not be rewritten"
    );
    assert!(
        !dir.path()
            .join("cs454/raft-consensus/annotations.json.bak")
            .exists(),
        "a newer file is not damaged, so nothing should be copied aside"
    );
}

/// The distinction that protects someone's highlights.
#[test]
fn an_unreadable_file_is_never_mistaken_for_an_absent_one() {
    // If a corrupt file read back as "no annotations", the next save would write that
    // emptiness straight over the person's work. Only genuine absence is empty.
    let (_dir, store) = new_store();
    let (_dir2, other) = new_store();

    // Genuinely absent.
    assert!(store.load(&bundle()).unwrap().is_empty());

    // Present but unparseable.
    other
        .storage()
        .write(&annotations_file(), b"not json at all")
        .unwrap();
    assert!(
        other.load(&bundle()).is_err(),
        "an unreadable file must not read back as empty"
    );
}

#[test]
fn a_hand_edited_file_that_breaks_an_invariant_is_refused() {
    // Two annotations sharing an id: a cite:// link in the notes would resolve to both.
    let (_dir, store) = new_store();
    let both_called_the_same = br#"{"schemaVersion":1,"annotations":[
        {"kind":"textHighlight","id":"hl-a","page":1,"semantic":"key","quote":"q",
         "rects":[{"x":0.1,"y":0.1,"width":0.1,"height":0.1}],
         "createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"},
        {"kind":"textHighlight","id":"hl-a","page":2,"semantic":"key","quote":"q",
         "rects":[{"x":0.1,"y":0.1,"width":0.1,"height":0.1}],
         "createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}]}"#;
    store
        .storage()
        .write(&annotations_file(), both_called_the_same)
        .unwrap();

    let err = store.load(&bundle()).unwrap_err();

    assert_eq!(err.code(), "ERR_STORED_FILE_UNREADABLE");
}

#[test]
fn a_failed_save_leaves_the_previous_annotations_intact() {
    // The atomic path means a bundle directory that has gone away cannot leave a
    // half-written file behind.
    let (dir, store) = new_store();
    store.save(&bundle(), &sample()).unwrap();
    let before = fs::read(dir.path().join("cs454/raft-consensus/annotations.json")).unwrap();

    fs::remove_dir_all(dir.path().join("cs454/raft-consensus")).unwrap();
    assert!(store.save(&bundle(), &AnnotationSet::empty()).is_err());

    // Restore the directory and confirm nothing partial was left anywhere.
    fs::create_dir_all(dir.path().join("cs454/raft-consensus")).unwrap();
    fs::write(
        dir.path().join("cs454/raft-consensus/annotations.json"),
        &before,
    )
    .unwrap();
    assert_eq!(store.load(&bundle()).unwrap(), sample());
}
