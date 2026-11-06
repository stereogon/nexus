//! A lecture's number: taken from the file's name at import, editable, and what places it.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use std::fs;
use std::path::PathBuf;

use nexus_app::edit::{LectureEdit, apply_edit};
use nexus_app::import::bring_in;
use nexus_app::vault::{LectureRow, open_vault};
use tempfile::TempDir;

struct Fixture {
    _held: TempDir,
    vault: PathBuf,
    inbox: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let held = TempDir::new().unwrap();
        let vault = held.path().join("vault");
        let inbox = held.path().join("inbox");
        fs::create_dir_all(&vault).unwrap();
        fs::create_dir_all(&inbox).unwrap();

        Self {
            _held: held,
            vault,
            inbox,
        }
    }

    fn vault(&self) -> String {
        self.vault.display().to_string()
    }

    fn import(&self, name: &str) -> LectureRow {
        let path = self.inbox.join(name);
        fs::write(&path, b"%PDF-1.7\nnot a real document, but a real file\n").unwrap();

        bring_in(&self.vault(), &path.display().to_string()).unwrap()
    }

    /// Titles in the vault's order, which is `sequence` order.
    fn order(&self) -> Vec<String> {
        let mut lectures = open_vault(&self.vault()).unwrap().lectures;
        lectures.sort_by(|a, b| a.sequence.cmp(&b.sequence));
        lectures.into_iter().map(|lecture| lecture.title).collect()
    }

    fn renumber(&self, lecture: &LectureRow, number: &str) -> LectureRow {
        let edit = LectureEdit {
            number: Some(number.to_owned()),
            ..LectureEdit::default()
        };

        apply_edit(&self.vault(), &lecture.directory, &edit).unwrap()
    }
}

#[test]
fn the_number_is_taken_out_of_the_file_name() {
    let vault = Fixture::new();
    let added = vault.import("2. ProcessOverview.pdf");

    assert_eq!(added.title, "ProcessOverview");
    assert_eq!(added.number.as_deref(), Some("2"));
}

#[test]
fn a_file_name_without_a_number_imports_as_before() {
    let vault = Fixture::new();
    let added = vault.import("Paxos Made Simple.pdf");

    assert_eq!(added.title, "Paxos Made Simple");
    assert_eq!(added.number, None);
}

#[test]
fn lectures_imported_out_of_order_are_placed_by_number() {
    let vault = Fixture::new();
    vault.import("Lecture 3 Raft.pdf");
    vault.import("Lecture 1 Intro.pdf");
    vault.import("Lecture 10 Byzantine.pdf");
    vault.import("Lecture 2 Clocks.pdf");

    assert_eq!(vault.order(), ["Intro", "Clocks", "Raft", "Byzantine"]);
}

#[test]
fn two_lectures_sharing_a_title_once_numbered_both_import() {
    // The folder keeps the whole file name, so the shared title cannot collide.
    let vault = Fixture::new();
    vault.import("Week 1 Lecture 1.pdf");
    vault.import("Week 1 Lecture 2.pdf");

    assert_eq!(vault.order(), ["Week 1", "Week 1"]);
}

#[test]
fn changing_a_number_moves_the_lecture() {
    let vault = Fixture::new();
    vault.import("1 Intro.pdf");
    vault.import("2 Clocks.pdf");
    let raft = vault.import("3 Raft.pdf");

    let renumbered = vault.renumber(&raft, "1a");

    assert_eq!(renumbered.number.as_deref(), Some("1a"));
    assert_eq!(vault.order(), ["Intro", "Raft", "Clocks"]);
}

#[test]
fn a_number_can_be_given_to_a_lecture_that_had_none_and_cleared_again() {
    let vault = Fixture::new();
    vault.import("1 Intro.pdf");
    vault.import("3 Raft.pdf");
    let clocks = vault.import("Clocks.pdf");
    assert_eq!(vault.order(), ["Intro", "Raft", "Clocks"]);

    let numbered = vault.renumber(&clocks, "2");
    assert_eq!(vault.order(), ["Intro", "Clocks", "Raft"]);

    // Cleared: no number, and it stays where it is rather than jumping.
    let cleared = vault.renumber(&numbered, "");
    assert_eq!(cleared.number, None);
    assert_eq!(vault.order(), ["Intro", "Clocks", "Raft"]);
}

#[test]
fn an_unusable_number_is_refused_and_changes_nothing() {
    let vault = Fixture::new();
    let raft = vault.import("3 Raft.pdf");
    let edit = LectureEdit {
        number: Some("3/4".to_owned()),
        ..LectureEdit::default()
    };

    let error = apply_edit(&vault.vault(), &raft.directory, &edit).unwrap_err();

    assert_eq!(error.code, "ERR_LECTURE_NUMBER_UNUSABLE");
    assert_eq!(
        open_vault(&vault.vault()).unwrap().lectures[0]
            .number
            .as_deref(),
        Some("3")
    );
}

#[test]
fn editing_only_the_title_leaves_the_number_and_the_place() {
    let vault = Fixture::new();
    let raft = vault.import("3 Raft.pdf");
    let edit = LectureEdit {
        title: Some("Raft consensus".to_owned()),
        ..LectureEdit::default()
    };

    let edited = apply_edit(&vault.vault(), &raft.directory, &edit).unwrap();

    assert_eq!(edited.number.as_deref(), Some("3"));
    assert_eq!(edited.sequence, raft.sequence);
}

#[test]
fn an_older_lecture_whose_title_holds_its_number_is_offered_the_split() {
    // What a lecture imported before numbers were a field looks like: the number still in
    // the title, and no number of its own.
    let vault = Fixture::new();
    let raft = vault.import("Raft.pdf");
    let edit = LectureEdit {
        title: Some("2. ProcessOverview".to_owned()),
        ..LectureEdit::default()
    };
    let older = apply_edit(&vault.vault(), &raft.directory, &edit).unwrap();

    let offered = older.number_in_title.expect("the title holds a number");

    assert_eq!(offered.number, "2");
    assert_eq!(offered.title, "ProcessOverview");
    // Offered, not applied.
    assert_eq!(older.number, None);
    assert_eq!(older.title, "2. ProcessOverview");
}

#[test]
fn a_numbered_lecture_is_offered_nothing() {
    let vault = Fixture::new();

    assert!(
        vault
            .import("2. ProcessOverview.pdf")
            .number_in_title
            .is_none()
    );
}
