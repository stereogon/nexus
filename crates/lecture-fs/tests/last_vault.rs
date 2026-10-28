//! Remembering which vault to reopen, and every way that can come back empty.
//!
//! None of the empty cases is an error: a stale breadcrumb must cost the person a trip to
//! the picker and nothing more. That is the whole contract, so most of this file is about
//! what happens when the recorded vault is no longer there.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use std::fs;
use std::path::{Path, PathBuf};

use lecture_fs::last_vault::{LAST_VAULT_FILE_NAME, recall, remember};
use lecture_fs::vault_root::VaultRoot;
use tempfile::TempDir;

/// A device state base and a vault, both temporary.
///
/// `base` is a temporary directory for the reason `device_state` gives: no test in this
/// repository writes to the real `~/Library`.
struct Fixture {
    held: TempDir,
}

impl Fixture {
    fn new() -> Self {
        Self {
            held: TempDir::new().unwrap(),
        }
    }

    fn base(&self) -> PathBuf {
        self.held.path().join("state")
    }

    /// A directory that can be opened as a vault.
    fn vault(&self, name: &str) -> VaultRoot {
        let path = self.held.path().join(name);
        fs::create_dir_all(&path).unwrap();

        VaultRoot::open(&path).unwrap()
    }
}

#[test]
fn a_remembered_vault_comes_back() {
    let fixture = Fixture::new();
    let vault = fixture.vault("StudyVault");

    remember(&fixture.base(), &vault).unwrap();

    assert_eq!(recall(&fixture.base()).as_deref(), Some(vault.as_path()));
}

#[test]
fn nothing_remembered_is_not_a_failure() {
    // A first launch. The answer is the picker, not an error.
    let fixture = Fixture::new();
    fs::create_dir_all(fixture.base()).unwrap();

    assert_eq!(recall(&fixture.base()), None);
}

#[test]
fn a_base_that_does_not_exist_yet_reads_as_nothing_remembered() {
    // Before the first save there is no folder at all, which must behave exactly like an
    // empty one rather than crashing the launch.
    let fixture = Fixture::new();

    assert_eq!(recall(&fixture.base()), None);
}

#[test]
fn remembering_creates_the_folder_it_needs() {
    let fixture = Fixture::new();
    let vault = fixture.vault("StudyVault");

    remember(&fixture.base(), &vault).unwrap();

    assert!(fixture.base().join(LAST_VAULT_FILE_NAME).is_file());
}

#[test]
fn a_vault_that_has_been_moved_away_is_forgotten_rather_than_returned() {
    // The case this is really for. Returning a path that is gone would make the next
    // launch open with an error instead of a picker.
    let fixture = Fixture::new();
    let vault = fixture.vault("StudyVault");
    remember(&fixture.base(), &vault).unwrap();

    fs::remove_dir_all(vault.as_path()).unwrap();

    assert_eq!(recall(&fixture.base()), None);
}

#[test]
fn a_file_where_the_vault_was_is_not_mistaken_for_it() {
    // `is_dir` rather than `exists`: someone could leave a file with the vault's name, and
    // handing that to the loader would fail further in, with a worse message.
    let fixture = Fixture::new();
    let vault = fixture.vault("StudyVault");
    remember(&fixture.base(), &vault).unwrap();

    let path = vault.as_path().to_path_buf();
    fs::remove_dir_all(&path).unwrap();
    fs::write(&path, b"not a vault").unwrap();

    assert_eq!(recall(&fixture.base()), None);
}

#[test]
fn the_newest_vault_wins() {
    let fixture = Fixture::new();
    let first = fixture.vault("First");
    let second = fixture.vault("Second");

    remember(&fixture.base(), &first).unwrap();
    remember(&fixture.base(), &second).unwrap();

    assert_eq!(recall(&fixture.base()).as_deref(), Some(second.as_path()));
}

#[test]
fn the_recorded_file_is_one_readable_line() {
    // It is written where a person will see it, so the format is part of the contract: the
    // path and a newline, nothing else to decode.
    let fixture = Fixture::new();
    let vault = fixture.vault("StudyVault");
    remember(&fixture.base(), &vault).unwrap();

    let written = fs::read_to_string(fixture.base().join(LAST_VAULT_FILE_NAME)).unwrap();

    assert_eq!(written, format!("{}\n", vault.as_path().display()));
}

#[test]
fn a_hand_emptied_file_reads_as_nothing_remembered() {
    // An empty path would resolve to the current directory, which is somewhere inside the
    // app bundle. Worth a check of its own, because the failure would be baffling.
    let fixture = Fixture::new();
    fs::create_dir_all(fixture.base()).unwrap();
    fs::write(fixture.base().join(LAST_VAULT_FILE_NAME), b"\n").unwrap();

    assert_eq!(recall(&fixture.base()), None);
}

#[test]
fn a_vault_whose_name_ends_in_a_space_survives() {
    // The documented limit is a *newline*, not a space. Trimming whitespace would have been
    // the easy way to write this module and would quietly break this name.
    let fixture = Fixture::new();
    let vault = fixture.vault("Study Vault ");

    remember(&fixture.base(), &vault).unwrap();

    assert_eq!(recall(&fixture.base()).as_deref(), Some(vault.as_path()));
    assert!(
        Path::new(vault.as_path()).to_string_lossy().ends_with(' '),
        "the fixture has to actually end in a space for this to mean anything"
    );
}
