//! Importing a document into a vault, through the command the UI actually calls.
//!
//! These run against a temporary vault. `CLAUDE.md` §2 makes pointing the app at a real
//! `StudyVault` something to ask about first, and a test is exactly the place where that
//! would be easy to do by accident.

// Indexing is allowed here alongside the usual test overrides sanctioned in `Cargo.toml`:
// these assertions are about a vault this file built, so `lectures[0]` says what it means.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use std::fs;
use std::path::{Path, PathBuf};

use nexus_app::import::bring_in;
use nexus_app::vault::open_vault;
use tempfile::TempDir;

/// A vault folder with nothing in it, and somewhere to keep documents outside it.
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

    /// A document waiting outside the vault, as one would be before import.
    fn document(&self, name: &str) -> String {
        let path = self.inbox.join(name);
        // Enough of a PDF to be recognised as one. Importing a PDF needs no converter,
        // which is what keeps these tests runnable without LibreOffice.
        fs::write(&path, b"%PDF-1.7\nnot a real document, but a real file\n").unwrap();

        path.display().to_string()
    }
}

#[test]
fn importing_a_document_creates_the_manifest_that_makes_it_a_lecture() {
    // The question a person asks the first time they open an empty vault: nothing appears
    // on disk until something is imported, because a lecture *is* a directory holding a
    // manifest, and manifests are written by importing rather than by looking.
    let fixture = Fixture::new();

    assert!(
        open_vault(&fixture.vault()).unwrap().lectures.is_empty(),
        "an empty folder is an empty vault"
    );

    let added = bring_in(&fixture.vault(), &fixture.document("Raft Consensus.pdf")).unwrap();

    assert_eq!(added.title, "Raft Consensus");
    assert_eq!(added.directory, "raft-consensus");
    assert!(
        fixture
            .vault
            .join("raft-consensus")
            .join("manifest.json")
            .is_file(),
        "the manifest must exist on disk, not just in the returned row"
    );
}

#[test]
fn an_imported_lecture_is_there_the_next_time_the_vault_is_opened() {
    // The round trip that matters: the thing import wrote is the thing the scan finds.
    let fixture = Fixture::new();
    bring_in(&fixture.vault(), &fixture.document("Paxos Made Simple.pdf")).unwrap();

    let summary = open_vault(&fixture.vault()).unwrap();

    assert_eq!(summary.lectures.len(), 1);
    assert_eq!(summary.lectures[0].title, "Paxos Made Simple");
    assert!(summary.unloadable.is_empty());
    assert!(summary.skipped.is_empty());
}

#[test]
fn a_pdf_needs_no_conversion_and_can_be_opened_at_once() {
    let fixture = Fixture::new();

    let added = bring_in(&fixture.vault(), &fixture.document("Consensus.pdf")).unwrap();

    assert_eq!(added.conversion, "notRequired");
    assert!(added.document_ready);
}

#[test]
fn the_original_is_kept_beside_the_document() {
    // §3: the original is always kept so reconversion stays possible. For a PDF the
    // original *is* the document, so what matters is that the bytes arrived.
    let fixture = Fixture::new();
    bring_in(&fixture.vault(), &fixture.document("Raft.pdf")).unwrap();

    let source = fixture.vault.join("raft").join("source");

    assert!(source.is_dir(), "the source directory should exist");
    assert!(
        fs::read_dir(&source).unwrap().next().is_some(),
        "the source directory should not be empty"
    );
}

#[test]
fn lectures_are_appended_after_the_ones_already_there() {
    // `sequence` is authoritative for order, so a second import must sort after the first
    // rather than landing in an arbitrary place.
    let fixture = Fixture::new();
    let first = bring_in(&fixture.vault(), &fixture.document("One.pdf")).unwrap();
    let second = bring_in(&fixture.vault(), &fixture.document("Two.pdf")).unwrap();

    assert!(
        first.sequence < second.sequence,
        "{} should sort before {}",
        first.sequence,
        second.sequence
    );
}

#[test]
fn a_name_that_is_already_taken_is_refused_rather_than_overwritten() {
    // Importing over an existing lecture would destroy its notes and annotations, which is
    // the worst thing this command could do.
    let fixture = Fixture::new();
    bring_in(&fixture.vault(), &fixture.document("Raft.pdf")).unwrap();

    let again = bring_in(&fixture.vault(), &fixture.document("Raft.pdf"));
    let error = again.expect_err("the second import should be refused");

    assert_eq!(error.code, "ERR_LECTURE_ALREADY_HERE");
    assert!(!error.remediation.is_empty());

    // And the first lecture is untouched.
    assert_eq!(open_vault(&fixture.vault()).unwrap().lectures.len(), 1);
}

#[test]
fn a_format_nexus_does_not_import_is_refused_with_something_to_do_about_it() {
    let fixture = Fixture::new();
    let path = fixture.inbox.join("lecture.txt");
    fs::write(&path, b"notes I typed myself").unwrap();

    let error = bring_in(&fixture.vault(), &path.display().to_string())
        .expect_err("a .txt is not a lecture document");

    assert!(error.code.starts_with("ERR_"), "code was {}", error.code);
    assert!(!error.remediation.is_empty());
    // §4: a path holds course and lecture names, so it must not ride along to the UI.
    assert!(!error.remediation.contains("lecture.txt"));
}

#[test]
fn a_vault_that_is_not_there_fails_before_anything_is_written() {
    let fixture = Fixture::new();
    let missing = fixture.vault.join("nowhere");

    let error = bring_in(&missing.display().to_string(), &fixture.document("A.pdf"))
        .expect_err("a missing vault should be refused");

    assert!(error.code.starts_with("ERR_"));
    assert!(
        !Path::new(&missing).exists(),
        "nothing should have been created"
    );
}
