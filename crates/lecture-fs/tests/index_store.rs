//! Contract tests for `.nexus/index.json` on a real filesystem.
//!
//! The test this file exists for is
//! `deleting_the_cache_directory_loses_nothing_a_scan_cannot_rebuild`. `CLAUDE.md` §3
//! requires that deleting `.nexus/` fully reconstructs from a vault scan, and until the
//! scan existed that was a claim rather than something checkable. It is now checkable, so
//! it is checked.
//!
//! The rest cover the deliberate difference from every other stored file: this one is
//! never trusted, so each way it can be unusable collapses to the same empty answer, and
//! none of them leaves a `.bak` behind.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::path::Path;

use lecture_core::{
    CACHE_DIR_NAME, Conversion, FixedClock, INDEX_SCHEMA_VERSION, Label, Manifest, OrderKey,
    RelativePath, Source, Timestamp,
};
use lecture_fs::{AtomicFsStorage, ManifestStore, VaultIndexStore, VaultLoader, VaultRoot};
use tempfile::TempDir;

const NOW: &str = "2026-10-28T09:30:00Z";

fn at(raw: &str) -> Timestamp {
    Timestamp::parse(raw).unwrap()
}

fn storage(root: &Path) -> AtomicFsStorage {
    AtomicFsStorage::new(VaultRoot::open(root).unwrap())
}

fn index_store(root: &Path) -> VaultIndexStore {
    VaultIndexStore::new(storage(root))
}

fn loader(root: &Path) -> VaultLoader<FixedClock> {
    VaultLoader::new(ManifestStore::new(storage(root), FixedClock::new(at(NOW))))
}

fn write_lecture(root: &Path, directory: &str, title: &str) {
    let path = RelativePath::parse(directory).unwrap();
    storage(root).create_dir(&path).unwrap();

    let source = Source::new(
        RelativePath::parse("source/document.pdf").unwrap(),
        None,
        Conversion::not_required(),
    )
    .unwrap();

    let manifest = Manifest::new(
        Label::parse(title).unwrap(),
        OrderKey::first(),
        source,
        at("2026-10-27T16:00:00Z"),
    );

    ManifestStore::new(storage(root), FixedClock::new(at(NOW)))
        .save(&path, &manifest)
        .unwrap();
}

fn cache_file(root: &Path) -> std::path::PathBuf {
    root.join(CACHE_DIR_NAME).join("index.json")
}

/// `CLAUDE.md` §3, as an executable claim.
#[test]
fn deleting_the_cache_directory_loses_nothing_a_scan_cannot_rebuild() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/raft", "Raft Consensus");
    write_lecture(dir.path(), "cs454/paxos", "Paxos");
    write_lecture(dir.path(), "quick-note", "A Quick Note");

    let store = index_store(dir.path());
    let first_scan = loader(dir.path()).load().unwrap();
    store.save(&first_scan.bundles).unwrap();

    let before = store.load();
    assert_eq!(before.len(), 3);
    let before_bytes = fs::read(cache_file(dir.path())).unwrap();

    // The whole cache, gone — as if someone cleared it in Finder.
    fs::remove_dir_all(dir.path().join(CACHE_DIR_NAME)).unwrap();
    assert!(!store.exists().unwrap());
    assert!(
        store.load().is_empty(),
        "a missing cache must read as empty, not fail"
    );

    // Rebuilt from the vault alone.
    let second_scan = loader(dir.path()).load().unwrap();
    store.save(&second_scan.bundles).unwrap();

    assert_eq!(store.load(), before, "the rebuilt index must be identical");
    assert_eq!(
        fs::read(cache_file(dir.path())).unwrap(),
        before_bytes,
        "and byte-identical, so rebuilding is not seen as a change"
    );
}

#[test]
fn a_saved_index_round_trips() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/raft", "Raft Consensus");

    let store = index_store(dir.path());
    let scan = loader(dir.path()).load().unwrap();
    store.save(&scan.bundles).unwrap();

    let loaded = store.load();
    assert_eq!(loaded.len(), 1);
    let entry = loaded.entries().first().unwrap();
    assert_eq!(entry.title().as_str(), "Raft Consensus");
    assert_eq!(entry.directory().to_string(), "cs454/raft");
}

#[test]
fn saving_creates_the_cache_directory() {
    let dir = TempDir::new().unwrap();
    assert!(!dir.path().join(CACHE_DIR_NAME).exists());

    index_store(dir.path()).save(&[]).unwrap();

    assert!(cache_file(dir.path()).is_file());
}

#[test]
fn a_vault_with_no_cache_reads_as_empty() {
    let dir = TempDir::new().unwrap();

    assert!(index_store(dir.path()).load().is_empty());
    assert!(!index_store(dir.path()).exists().unwrap());
}

#[test]
fn a_corrupt_cache_is_discarded_rather_than_preserved() {
    // The opposite of the rule for manifest.json, and deliberately so: there is no work
    // in here to lose, and a .bak would be litter in a folder someone studies in.
    let dir = TempDir::new().unwrap();
    index_store(dir.path()).save(&[]).unwrap();
    fs::write(cache_file(dir.path()), b"{ truncated").unwrap();

    assert!(index_store(dir.path()).load().is_empty());
    assert!(
        !dir.path()
            .join(CACHE_DIR_NAME)
            .join("index.json.bak")
            .exists(),
        "a derived file must not leave a backup behind"
    );
}

#[test]
fn a_cache_from_a_newer_build_is_discarded_rather_than_refused() {
    // Also the opposite of the rule for manifest.json. A newer *manifest* is left
    // strictly alone, because misreading it would corrupt work. A newer cache holds
    // nothing, so the safe move is to ignore it and rebuild.
    let dir = TempDir::new().unwrap();
    index_store(dir.path()).save(&[]).unwrap();
    fs::write(
        cache_file(dir.path()),
        format!(
            r#"{{ "schemaVersion": {}, "entries": [] }}"#,
            INDEX_SCHEMA_VERSION + 1
        ),
    )
    .unwrap();

    assert!(index_store(dir.path()).load().is_empty());
}

#[test]
fn the_cache_is_not_itself_mistaken_for_a_lecture() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/raft", "Raft Consensus");

    let store = index_store(dir.path());
    store
        .save(&loader(dir.path()).load().unwrap().bundles)
        .unwrap();

    // Scanning again, now that `.nexus/` exists on disk.
    let rescanned = loader(dir.path()).load().unwrap();

    assert_eq!(rescanned.bundles.len(), 1);
    assert!(
        rescanned.skipped.is_empty(),
        "the cache directory is expected, not a problem: {:?}",
        rescanned.skipped
    );
}

#[test]
fn an_emptied_vault_caches_as_empty_rather_than_keeping_stale_entries() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/raft", "Raft Consensus");

    let store = index_store(dir.path());
    store
        .save(&loader(dir.path()).load().unwrap().bundles)
        .unwrap();
    assert_eq!(store.load().len(), 1);

    // The lecture is gone, and a rescan must overwrite rather than merge.
    fs::remove_dir_all(dir.path().join("cs454")).unwrap();
    store
        .save(&loader(dir.path()).load().unwrap().bundles)
        .unwrap();

    assert!(store.load().is_empty());
}
