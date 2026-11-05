//! Contract tests for `NotesStore` — `notes.md`, against a real filesystem.
//!
//! Every case here is about not losing what someone typed: a save based on an old read
//! must not overwrite a newer file, a file changed outside the app must be noticed, and a
//! file that is not text must be kept rather than "repaired".

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::path::PathBuf;

use lecture_core::{BackupOutcome, CoreError, RelativePath};
use lecture_fs::{AtomicFsStorage, NotesSave, NotesStore, VaultRoot};
use tempfile::TempDir;

const BUNDLE: &str = "cs454/raft-consensus";

fn bundle() -> RelativePath {
    RelativePath::parse(BUNDLE).unwrap()
}

fn new_store() -> (TempDir, NotesStore) {
    let dir = TempDir::new().unwrap();
    let storage = AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap());
    storage.create_dir(&bundle()).unwrap();

    (dir, NotesStore::new(storage))
}

fn notes_file(dir: &TempDir) -> PathBuf {
    dir.path().join(BUNDLE).join("notes.md")
}

fn saved_version(outcome: NotesSave) -> String {
    match outcome {
        NotesSave::Saved { version } => version,
        NotesSave::Conflict { on_disk } => {
            panic!("expected a save, got a conflict with {on_disk:?}")
        }
    }
}

#[test]
fn a_lecture_with_no_notes_loads_as_empty_without_creating_the_file() {
    let (dir, store) = new_store();

    let notes = store.load(&bundle()).unwrap();

    assert_eq!(notes.text, "");
    assert!(!notes_file(&dir).exists());
}

#[test]
fn saved_notes_come_back_byte_for_byte() {
    // Including the emoji the citation line opens with, and maths.
    let (dir, store) = new_store();
    let typed = "# Week 2\n\n> 📌 **[Page 4](cite://hl-1)**: *\"Raft\"*\n\n$e^{i\\pi} + 1 = 0$\n";

    let first = store.load(&bundle()).unwrap();
    let version = saved_version(store.save(&bundle(), typed, &first.version).unwrap());
    let again = store.load(&bundle()).unwrap();

    assert_eq!(again.text, typed);
    assert_eq!(again.version, version);
    assert_eq!(fs::read(notes_file(&dir)).unwrap(), typed.as_bytes());
}

#[test]
fn a_save_based_on_an_old_read_does_not_overwrite_a_newer_file() {
    // Two windows, or two devices: both read version A, one saves B, the other then tries
    // to save C based on A. C must not land on top of B.
    let (dir, store) = new_store();
    let start = store.load(&bundle()).unwrap();
    saved_version(
        store
            .save(&bundle(), "from the laptop\n", &start.version)
            .unwrap(),
    );

    let outcome = store
        .save(&bundle(), "from the iPad\n", &start.version)
        .unwrap();

    let NotesSave::Conflict { on_disk } = outcome else {
        panic!("expected a conflict, got {outcome:?}");
    };
    assert_eq!(on_disk.text, "from the laptop\n");
    assert_eq!(
        fs::read_to_string(notes_file(&dir)).unwrap(),
        "from the laptop\n"
    );
}

#[test]
fn a_change_made_outside_the_app_is_noticed() {
    // A sync client, or another editor, writing the file directly.
    let (dir, store) = new_store();
    let start = store.load(&bundle()).unwrap();
    let version = saved_version(store.save(&bundle(), "mine\n", &start.version).unwrap());
    fs::write(notes_file(&dir), "edited in another app\n").unwrap();

    let outcome = store
        .save(&bundle(), "mine, continued\n", &version)
        .unwrap();

    assert!(matches!(outcome, NotesSave::Conflict { .. }));
    assert_eq!(
        fs::read_to_string(notes_file(&dir)).unwrap(),
        "edited in another app\n"
    );
}

#[test]
fn the_conflict_carries_the_version_to_save_over_it_with() {
    // So the window can keep the person's text and save it deliberately, once they have
    // seen what was on disk -- without a second read that could race again.
    let (dir, store) = new_store();
    let start = store.load(&bundle()).unwrap();
    fs::write(notes_file(&dir), "theirs\n").unwrap();

    let NotesSave::Conflict { on_disk } = store.save(&bundle(), "mine\n", &start.version).unwrap()
    else {
        panic!("expected a conflict");
    };

    saved_version(store.save(&bundle(), "mine\n", &on_disk.version).unwrap());
    assert_eq!(fs::read_to_string(notes_file(&dir)).unwrap(), "mine\n");
}

#[test]
fn an_empty_file_appearing_is_not_a_conflict() {
    // Missing and empty both mean "no notes yet"; an import or another device creating an
    // empty file must not make the first save look contested.
    let (dir, store) = new_store();
    let missing = store.load(&bundle()).unwrap();
    fs::write(notes_file(&dir), "").unwrap();

    let outcome = store
        .save(&bundle(), "first note\n", &missing.version)
        .unwrap();

    assert!(matches!(outcome, NotesSave::Saved { .. }));
}

#[test]
fn a_file_that_is_not_text_is_kept_aside_and_never_overwritten() {
    // Decoding it with replacement characters would let the next save write those back,
    // and the original bytes would be gone for good.
    let (dir, store) = new_store();
    let not_text = [b'o', b'k', 0xFF, 0xFE, b'!'];
    fs::write(notes_file(&dir), not_text).unwrap();

    let refused = store.load(&bundle()).unwrap_err();

    let CoreError::StoredFileUnreadable { file, backup, .. } = &refused else {
        panic!("expected StoredFileUnreadable, got {refused:?}");
    };
    assert_eq!(*file, "notes.md");
    assert!(matches!(backup, BackupOutcome::Saved(_)));
    assert_eq!(
        fs::read(dir.path().join(BUNDLE).join("notes.md.bak")).unwrap(),
        not_text
    );

    assert!(store.save(&bundle(), "anything\n", "whatever").is_err());
    assert_eq!(fs::read(notes_file(&dir)).unwrap(), not_text);
}
