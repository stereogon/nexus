//! Moving a folder, with everything in it, through the command the sidebar's drag calls.
//! Against temporary vaults, never a real one (`CLAUDE.md` §2).

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::path::PathBuf;

use lecture_core::{LectureView, PageNumber, RelativePath, ViewState};
use lecture_fs::{DeviceStateStore, VaultRoot};
use nexus_app::folder_move::move_folder_under;
use nexus_app::folders::{make_folder, make_note};
use tempfile::TempDir;

struct Fixture {
    _held: TempDir,
    vault: PathBuf,
    state: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let held = TempDir::new().unwrap();
        let vault = held.path().join("vault");
        let state = held.path().join("state");
        fs::create_dir_all(&vault).unwrap();
        fs::create_dir_all(&state).unwrap();

        Self {
            _held: held,
            vault,
            state,
        }
    }

    fn vault(&self) -> String {
        self.vault.display().to_string()
    }
}

#[test]
fn a_folder_moves_with_its_items_their_notes_and_their_places() {
    let fixture = Fixture::new();
    make_folder(&fixture.vault(), "", "Archive").unwrap();
    make_folder(&fixture.vault(), "", "Week 3").unwrap();
    make_folder(&fixture.vault(), "Week 3", "Extra").unwrap();
    let note = make_note(&fixture.vault(), "Week 3/Extra", "Plans").unwrap();
    fs::write(
        fixture.vault.join(&note.directory).join("notes.md"),
        "# kept\n",
    )
    .unwrap();

    let root = VaultRoot::open(&fixture.vault).unwrap();
    let mut state = ViewState::empty();
    state.remember(
        &RelativePath::parse(&note.directory).unwrap(),
        LectureView::at_page(PageNumber::new(4).unwrap()),
    );
    DeviceStateStore::under(&fixture.state, &root)
        .unwrap()
        .save(&state)
        .unwrap();

    let moved = move_folder_under(&fixture.state, &fixture.vault(), "Week 3", "Archive").unwrap();

    assert_eq!(moved.folder, "Archive/Week 3");
    assert!(moved.place_lost.is_none());
    assert_eq!(
        fs::read_to_string(fixture.vault.join("Archive/Week 3/Extra/plans/notes.md")).unwrap(),
        "# kept\n"
    );
    assert!(!fixture.vault.join("Week 3").exists());
    let after = DeviceStateStore::under(&fixture.state, &root)
        .unwrap()
        .load();
    assert_eq!(
        after
            .position_in(&RelativePath::parse("Archive/Week 3/Extra/plans").unwrap())
            .map(LectureView::page),
        Some(PageNumber::new(4).unwrap())
    );
}

#[test]
fn a_folder_cannot_go_inside_itself() {
    let fixture = Fixture::new();
    make_folder(&fixture.vault(), "", "Week 3").unwrap();
    make_folder(&fixture.vault(), "Week 3", "Extra").unwrap();

    for into in ["Week 3", "Week 3/Extra"] {
        let refused = move_folder_under(&fixture.state, &fixture.vault(), "Week 3", into);

        assert_eq!(
            refused.unwrap_err().code,
            "ERR_FOLDER_INTO_ITSELF",
            "into {into}"
        );
    }
    assert!(
        fixture.vault.join("Week 3/Extra").is_dir(),
        "left where it was"
    );
}

#[test]
fn nothing_inside_may_end_up_deeper_than_the_vault_looks() {
    let fixture = Fixture::new();
    // Four deep, then a folder holding a note two deeper: moved under it, the note would
    // sit at depth six.
    make_folder(&fixture.vault(), "", "a").unwrap();
    make_folder(&fixture.vault(), "a", "b").unwrap();
    make_folder(&fixture.vault(), "a/b", "c").unwrap();
    make_folder(&fixture.vault(), "a/b/c", "d").unwrap();
    make_folder(&fixture.vault(), "", "Deep").unwrap();
    make_note(&fixture.vault(), "Deep", "Inside").unwrap();

    let refused = move_folder_under(&fixture.state, &fixture.vault(), "Deep", "a/b/c/d");

    assert_eq!(refused.unwrap_err().code, "ERR_FOLDER_TOO_DEEP");
    assert!(fixture.vault.join("Deep/inside/manifest.json").is_file());
}

#[test]
fn a_move_never_lands_on_a_name_already_there() {
    let fixture = Fixture::new();
    make_folder(&fixture.vault(), "", "Archive").unwrap();
    make_folder(&fixture.vault(), "Archive", "Week 3").unwrap();
    make_folder(&fixture.vault(), "", "Week 3").unwrap();
    make_note(&fixture.vault(), "Week 3", "Plans").unwrap();

    let refused = move_folder_under(&fixture.state, &fixture.vault(), "Week 3", "Archive");

    assert_eq!(refused.unwrap_err().code, "ERR_NAME_ALREADY_HERE");
    assert!(fixture.vault.join("Week 3/plans/manifest.json").is_file());
}

#[test]
fn the_top_of_the_vault_is_not_a_folder_to_move() {
    let fixture = Fixture::new();
    make_folder(&fixture.vault(), "", "Archive").unwrap();

    assert_eq!(
        move_folder_under(&fixture.state, &fixture.vault(), "", "Archive")
            .unwrap_err()
            .code,
        "ERR_NOT_A_FOLDER"
    );
}
