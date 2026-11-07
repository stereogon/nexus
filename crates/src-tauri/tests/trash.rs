//! Deleting an item: it moves whole into the vault's hidden `.trash`, and never over
//! anything already there. Against temporary vaults (`CLAUDE.md` §2).

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;

use nexus_app::folders::{make_folder, make_note};
use nexus_app::trash::move_to_trash;
use nexus_app::vault::open_vault;
use tempfile::TempDir;

fn vault() -> (TempDir, String) {
    let held = TempDir::new().unwrap();
    let path = held.path().join("vault");
    fs::create_dir_all(&path).unwrap();
    let shown = path.display().to_string();

    (held, shown)
}

#[test]
fn a_deleted_note_leaves_the_vault_and_keeps_everything_in_the_trash() {
    let (held, vault) = vault();
    make_folder(&vault, "", "CS454").unwrap();
    let note = make_note(&vault, "CS454", "Raft").unwrap();
    let root = held.path().join("vault");
    fs::write(root.join("CS454/raft/notes.md"), "# kept\n").unwrap();

    let went = move_to_trash(&vault, &note.directory).unwrap();

    assert_eq!(went, ".trash/CS454 - raft", "named for where it came from");
    assert_eq!(
        fs::read_to_string(root.join(".trash/CS454 - raft/notes.md")).unwrap(),
        "# kept\n"
    );
    assert!(!root.join("CS454/raft").exists());

    let summary = open_vault(&vault).unwrap();
    assert!(summary.lectures.is_empty(), "the trash is not walked");
    assert_eq!(summary.folders, ["CS454"], "and is not listed as a folder");
}

#[test]
fn deleting_something_of_the_same_name_again_never_writes_over_the_first() {
    let (held, vault) = vault();
    let first = make_note(&vault, "", "Plans").unwrap();
    fs::write(held.path().join("vault/plans/notes.md"), "first").unwrap();
    move_to_trash(&vault, &first.directory).unwrap();

    let second = make_note(&vault, "", "Plans").unwrap();
    let went = move_to_trash(&vault, &second.directory).unwrap();

    assert_eq!(went, ".trash/plans 2");
    assert_eq!(
        fs::read_to_string(held.path().join("vault/.trash/plans/notes.md")).unwrap(),
        "first"
    );
}

#[test]
fn only_an_item_can_be_deleted() {
    let (_held, vault) = vault();
    make_folder(&vault, "", "CS454").unwrap();

    assert_eq!(
        move_to_trash(&vault, "CS454").unwrap_err().code,
        "ERR_ITEM_NOT_FOUND"
    );
    assert_eq!(
        move_to_trash(&vault, "missing").unwrap_err().code,
        "ERR_ITEM_NOT_FOUND"
    );
}
