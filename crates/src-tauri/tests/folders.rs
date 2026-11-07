//! Folders, plain notes, and moving items between folders, through the commands the UI
//! calls. Against temporary vaults, never a real one (`CLAUDE.md` §2).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use std::fs;
use std::path::PathBuf;

use lecture_core::{LectureView, PageNumber, RelativePath, ViewState};
use lecture_fs::{DeviceStateStore, VaultRoot};
use nexus_app::document::prepare_document;
use nexus_app::folders::{make_folder, make_note, move_under};
use nexus_app::import::bring_in_to;
use nexus_app::vault::open_vault;
use tempfile::TempDir;

struct Fixture {
    _held: TempDir,
    vault: PathBuf,
    inbox: PathBuf,
    state: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let held = TempDir::new().unwrap();
        let vault = held.path().join("vault");
        let inbox = held.path().join("inbox");
        let state = held.path().join("state");
        for dir in [&vault, &inbox, &state] {
            fs::create_dir_all(dir).unwrap();
        }

        Self {
            _held: held,
            vault,
            inbox,
            state,
        }
    }

    fn vault(&self) -> String {
        self.vault.display().to_string()
    }

    fn pdf(&self, name: &str) -> String {
        let path = self.inbox.join(name);
        fs::write(&path, b"%PDF-1.7\nnot a real document, but a real file\n").unwrap();
        path.display().to_string()
    }
}

#[test]
fn a_new_folder_is_listed_while_it_is_still_empty() {
    let fixture = Fixture::new();

    assert_eq!(make_folder(&fixture.vault(), "", "CS454").unwrap(), "CS454");
    assert_eq!(
        make_folder(&fixture.vault(), "CS454", " Week 3 ").unwrap(),
        "CS454/Week 3",
        "nested, with the name kept as typed apart from the spaces around it"
    );

    let summary = open_vault(&fixture.vault()).unwrap();

    assert_eq!(summary.folders, ["CS454", "CS454/Week 3"]);
    assert!(summary.lectures.is_empty());
}

#[test]
fn a_folder_is_not_made_over_one_that_is_there() {
    let fixture = Fixture::new();
    make_folder(&fixture.vault(), "", "Reading").unwrap();

    let refused = make_folder(&fixture.vault(), "", "Reading").unwrap_err();

    assert_eq!(refused.code, "ERR_NAME_ALREADY_HERE");
}

#[test]
fn nothing_is_made_inside_a_document_or_note() {
    // The inside of a bundle is its own business: a folder made in `assets/` would be one
    // the vault walk never shows.
    let fixture = Fixture::new();
    let note = make_note(&fixture.vault(), "", "Ideas").unwrap();

    assert_eq!(
        make_folder(&fixture.vault(), &note.directory, "Inner")
            .unwrap_err()
            .code,
        "ERR_NOT_A_FOLDER"
    );
    assert_eq!(
        make_note(&fixture.vault(), "missing", "Ideas")
            .unwrap_err()
            .code,
        "ERR_NOT_A_FOLDER"
    );
}

#[test]
fn a_note_is_an_item_with_no_document() {
    let fixture = Fixture::new();
    make_folder(&fixture.vault(), "", "Journal").unwrap();

    let note = make_note(&fixture.vault(), "Journal", "Monday plans").unwrap();

    assert_eq!(note.directory, "Journal/monday-plans");
    assert_eq!(note.kind, "note");
    assert_eq!(note.title, "Monday plans");
    assert!(!note.document_ready);

    let listed = open_vault(&fixture.vault()).unwrap();
    assert_eq!(
        listed.lectures.len(),
        1,
        "the note is found by the vault walk"
    );
    assert_eq!(listed.lectures[0].kind, "note");
    assert_eq!(
        prepare_document(&fixture.vault(), &note.directory)
            .unwrap_err()
            .code,
        "ERR_NOTE_HAS_NO_DOCUMENT"
    );
}

#[test]
fn a_document_imported_into_a_folder_lands_in_it() {
    let fixture = Fixture::new();
    make_folder(&fixture.vault(), "", "Papers").unwrap();

    let imported = bring_in_to(&fixture.vault(), "Papers", &fixture.pdf("Raft.pdf")).unwrap();

    assert_eq!(imported.directory, "Papers/raft");
    assert_eq!(imported.kind, "document");
    assert!(
        fixture
            .vault
            .join("Papers/raft/source/document.pdf")
            .is_file()
    );
}

#[test]
fn numbers_place_an_item_among_its_own_folder_only() {
    // A "1" in another folder must not decide where this folder's "2" goes.
    let fixture = Fixture::new();
    make_folder(&fixture.vault(), "", "A").unwrap();
    make_folder(&fixture.vault(), "", "B").unwrap();
    let elsewhere = bring_in_to(&fixture.vault(), "B", &fixture.pdf("1. Elsewhere.pdf")).unwrap();
    let last = bring_in_to(&fixture.vault(), "A", &fixture.pdf("3. Third.pdf")).unwrap();
    let second = bring_in_to(&fixture.vault(), "A", &fixture.pdf("2. Second.pdf")).unwrap();

    assert!(
        second.sequence < last.sequence,
        "2 is placed before 3 in its folder"
    );
    assert_ne!(second.sequence, elsewhere.sequence);
}

#[test]
fn moving_an_item_carries_its_place_with_it() {
    let fixture = Fixture::new();
    make_folder(&fixture.vault(), "", "Archive").unwrap();
    let note = make_note(&fixture.vault(), "", "Old plans").unwrap();
    fs::write(fixture.vault.join("old-plans/notes.md"), "# kept\n").unwrap();

    let root = VaultRoot::open(&fixture.vault).unwrap();
    let device = DeviceStateStore::under(&fixture.state, &root).unwrap();
    let mut state = ViewState::empty();
    state.remember(
        &RelativePath::parse(&note.directory).unwrap(),
        LectureView::at_page(PageNumber::new(4).unwrap()),
    );
    device.save(&state).unwrap();

    let moved = move_under(&fixture.state, &fixture.vault(), &note.directory, "Archive").unwrap();

    assert_eq!(moved.item.directory, "Archive/old-plans");
    assert!(moved.place_lost.is_none());
    assert_eq!(
        fs::read_to_string(fixture.vault.join("Archive/old-plans/notes.md")).unwrap(),
        "# kept\n",
        "the notes travel with the item"
    );
    let after = DeviceStateStore::under(&fixture.state, &root)
        .unwrap()
        .load();
    assert_eq!(
        after
            .position_in(&RelativePath::parse("Archive/old-plans").unwrap())
            .map(LectureView::page),
        Some(PageNumber::new(4).unwrap())
    );
}

#[test]
fn a_move_never_lands_on_something_already_there() {
    let fixture = Fixture::new();
    make_folder(&fixture.vault(), "", "Archive").unwrap();
    make_note(&fixture.vault(), "Archive", "Plans").unwrap();
    let note = make_note(&fixture.vault(), "", "Plans").unwrap();

    let refused = move_under(&fixture.state, &fixture.vault(), &note.directory, "Archive");

    assert_eq!(refused.unwrap_err().code, "ERR_NAME_ALREADY_TAKEN");
    assert!(
        fixture.vault.join("plans/manifest.json").is_file(),
        "left where it was"
    );
}
