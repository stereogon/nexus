//! That opening a vault actually writes a line, and writes nothing private in it.
//!
//! This exists because of a real bug: `logging::vault_opened` was written, documented and
//! never called, so every successful session produced an empty log file. Nothing failed —
//! the log simply recorded nothing, which reads as logging being broken and is impossible
//! to tell apart from it. A test that asserts the event reaches disk is the only kind that
//! catches a call that is missing rather than wrong.
//!
//! As `lecture-fs`'s `logging_file.rs` explains, a `tracing` subscriber is global to a
//! **process** and tests in one binary run in parallel threads, so this file holds exactly
//! one `#[test]`. It reads the file back rather than trusting a return value, because what
//! matters is what ends up on disk.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::fs;
use std::path::Path;

use lecture_core::{
    Conversion, FixedClock, Label, Manifest, OrderKey, RelativePath, Source, Timestamp,
};
use lecture_fs::{AtomicFsStorage, ManifestStore, VaultRoot, logging};
use nexus_app::vault::open_vault;
use tempfile::TempDir;

/// A lecture title, and the one string that must not appear in the log. A folder name
/// carries a course title, which is exactly what §4 keeps out of diagnostics.
const PRIVATE_TITLE: &str = "Treatment-Resistant-Depression";

/// Everything written beneath `base`, concatenated.
fn written(base: &Path) -> String {
    fs::read_dir(base)
        .unwrap()
        .map(|entry| fs::read_to_string(entry.unwrap().path()).unwrap())
        .collect()
}

/// Writes one readable lecture into `vault`, under a folder named after a private title.
fn lecture_in(vault: &Path) {
    let at = RelativePath::parse(PRIVATE_TITLE).unwrap();
    let root = VaultRoot::open(vault).unwrap();
    let storage = AtomicFsStorage::new(root);
    storage.create_dir(&at).unwrap();

    let source = Source::new(
        RelativePath::parse("source/document.pdf").unwrap(),
        None,
        Conversion::not_required(),
    )
    .unwrap();

    let created = Timestamp::parse("2026-10-27T16:00:00Z").unwrap();
    let manifest = Manifest::new(
        Label::parse(PRIVATE_TITLE).unwrap(),
        OrderKey::parse("a0").unwrap(),
        source,
        created.clone(),
    );

    ManifestStore::new(
        AtomicFsStorage::new(VaultRoot::open(vault).unwrap()),
        FixedClock::new(created),
    )
    .save(&at, &manifest)
    .unwrap();
}

#[test]
fn opening_a_vault_records_counts_and_a_timing_and_nothing_private() {
    let held = TempDir::new().unwrap();
    let base = held.path().join("Logs").join("Nexus");
    let vault = held.path().join("StudyVault");
    fs::create_dir_all(&vault).unwrap();
    lecture_in(&vault);

    logging::start(&base).expect("logging should start in a fresh process");

    let summary = open_vault(&vault.display().to_string()).expect("the vault should open");
    assert_eq!(summary.lectures.len(), 1, "the fixture holds one lecture");

    let log = written(&base);

    // The event itself. Before the fix this file was empty on a successful open.
    assert!(
        log.contains("vault opened"),
        "a successful open must record one line, got: {log}"
    );
    assert!(
        log.contains("\"lectures\":1"),
        "the counts belong in it: {log}"
    );
    assert!(log.contains("\"skipped\":0"));
    assert!(log.contains("\"unloadable\":0"));
    assert!(
        log.contains("elapsed_ms"),
        "a timing is half of what the log is read for: {log}"
    );

    // §4: not the notes, not the excerpts, and not the paths -- a path carries folder
    // names, which carry course and lecture titles. The vault root is a path, and
    // `open_vault` handles it, so this is the assertion that keeps it out of the line.
    assert!(
        !log.contains(PRIVATE_TITLE),
        "a lecture title reached the log: {log}"
    );
    assert!(
        !log.contains("StudyVault"),
        "the vault path reached the log: {log}"
    );
}
