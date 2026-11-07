//! Contract tests for walking and loading a real vault on disk.
//!
//! The domain's walk is already tested against an in-memory tree, so these cover what
//! only a real filesystem can: that the adapter classifies real directory entries
//! correctly, how a real symlink is *presented* to the walk, and that the whole stack
//! runs end to end — walk a tree, load each manifest, produce the list a sidebar shows.
//!
//! The symlink cases here are about **classification and reporting**, not about refusal.
//! Refusal itself is already covered by `vault_root.rs` and `storage.rs`. What is new is
//! that a link to a directory is reported with its own reason rather than lumped in with
//! "could not be read", and that a link to a file is not reported at all. The
//! `O_NOFOLLOW` gap recorded in `PROGRESS.md` stays open: nothing here exercises the
//! flag, only `resolve`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::path::Path;

use lecture_core::{
    Conversion, FixedClock, Label, Manifest, OrderKey, RelativePath, SkipReason, Source, Timestamp,
    VaultDirectory,
};
use lecture_fs::{AtomicFsStorage, FsVaultDirectory, ManifestStore, VaultLoader, VaultRoot};
use tempfile::TempDir;

const CREATED: &str = "2026-10-27T16:00:00Z";
const NOW: &str = "2026-10-28T09:30:00Z";

fn label(raw: &str) -> Label {
    Label::parse(raw).unwrap()
}

fn at(raw: &str) -> Timestamp {
    Timestamp::parse(raw).unwrap()
}

fn manifest(title: &str) -> Manifest {
    let source = Source::new(
        RelativePath::parse("source/document.pdf").unwrap(),
        None,
        Conversion::not_required(),
    )
    .unwrap();

    Manifest::new(label(title), OrderKey::first(), source, at(CREATED))
}

fn loader(root: &Path) -> VaultLoader<FixedClock> {
    let storage = AtomicFsStorage::new(VaultRoot::open(root).unwrap());
    VaultLoader::new(ManifestStore::new(storage, FixedClock::new(at(NOW))))
}

/// Creates a lecture on disk, manifest and all.
fn write_lecture(root: &Path, directory: &str, title: &str) {
    let storage = AtomicFsStorage::new(VaultRoot::open(root).unwrap());
    let path = RelativePath::parse(directory).unwrap();
    storage.create_dir(&path).unwrap();

    let store = ManifestStore::new(storage, FixedClock::new(at(NOW)));
    store.save(&path, &manifest(title)).unwrap();
}

#[test]
fn loads_every_lecture_in_a_real_vault() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/raft", "Raft Consensus");
    write_lecture(dir.path(), "cs454/paxos", "Paxos");
    write_lecture(dir.path(), "quick-note", "A Quick Note");

    let loaded = loader(dir.path()).load().unwrap();

    let titles: Vec<&str> = loaded
        .bundles
        .iter()
        .map(|b| b.manifest().title().as_str())
        .collect();

    // Path order: cs454/paxos, cs454/raft, quick-note.
    assert_eq!(titles, ["Paxos", "Raft Consensus", "A Quick Note"]);
    assert!(loaded.skipped.is_empty());
    assert!(loaded.unloadable.is_empty());
}

#[test]
fn an_empty_vault_loads_as_empty_rather_than_failing() {
    let dir = TempDir::new().unwrap();

    let loaded = loader(dir.path()).load().unwrap();

    assert!(loaded.bundles.is_empty());
    assert!(loaded.skipped.is_empty());
}

#[test]
fn derives_the_real_paths_of_a_loaded_bundle() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/raft", "Raft Consensus");

    let loaded = loader(dir.path()).load().unwrap();
    let bundle = loaded.bundles.first().unwrap();

    assert_eq!(
        bundle.manifest_path().unwrap().to_string(),
        "cs454/raft/manifest.json"
    );
    assert_eq!(
        bundle.document_path().unwrap().unwrap().to_string(),
        "cs454/raft/source/document.pdf"
    );
}

/// The gap this file was written to close.
#[test]
fn a_symlinked_lecture_folder_is_refused_and_reported() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/raft", "Raft Consensus");

    // A real lecture outside the vault, linked in from inside it. The target will not
    // exist on another device, so following it would produce a lecture that vanishes on
    // sync.
    let outside = TempDir::new().unwrap();
    write_lecture(outside.path(), "borrowed", "Borrowed Lecture");
    std::os::unix::fs::symlink(outside.path().join("borrowed"), dir.path().join("linked")).unwrap();

    let loaded = loader(dir.path()).load().unwrap();

    assert_eq!(
        loaded.bundles.len(),
        1,
        "only the real lecture should load, got {:?}",
        loaded
            .bundles
            .iter()
            .map(|b| b.directory().to_string())
            .collect::<Vec<_>>()
    );

    let skipped = loaded
        .skipped
        .iter()
        .find(|s| s.shown_path == "linked")
        .expect("the refused link must be reported, not silently omitted");
    assert_eq!(skipped.reason, SkipReason::SymlinkRefused);
    assert!(
        skipped
            .reason
            .remediation()
            .contains("links inside a vault")
    );
}

#[test]
fn a_symlinked_file_is_not_reported_as_a_refused_folder() {
    // There is no lecture hidden behind a link to a file, so reporting it would be noise.
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/raft", "Raft Consensus");

    let outside = TempDir::new().unwrap();
    let target = outside.path().join("notes.md");
    fs::write(&target, b"# borrowed notes\n").unwrap();
    std::os::unix::fs::symlink(&target, dir.path().join("linked-notes.md")).unwrap();

    let loaded = loader(dir.path()).load().unwrap();

    assert_eq!(loaded.bundles.len(), 1);
    assert!(
        loaded.skipped.is_empty(),
        "a linked file hides no lecture: {:?}",
        loaded.skipped
    );
}

#[test]
fn a_broken_symlink_is_ignored_rather_than_reported() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/raft", "Raft Consensus");
    std::os::unix::fs::symlink(dir.path().join("nowhere"), dir.path().join("dangling")).unwrap();

    let loaded = loader(dir.path()).load().unwrap();

    assert_eq!(loaded.bundles.len(), 1);
    assert!(loaded.skipped.is_empty(), "{:?}", loaded.skipped);
}

/// One bad file must not cost a vault.
#[test]
fn a_corrupt_manifest_does_not_stop_the_other_lectures_loading() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/raft", "Raft Consensus");
    write_lecture(dir.path(), "cs454/broken", "Will Be Broken");
    fs::write(
        dir.path().join("cs454/broken/manifest.json"),
        b"{ truncated",
    )
    .unwrap();

    let loaded = loader(dir.path()).load().unwrap();

    assert_eq!(loaded.bundles.len(), 1, "the good lecture must still load");
    assert_eq!(
        loaded.bundles.first().unwrap().manifest().title().as_str(),
        "Raft Consensus"
    );

    assert_eq!(loaded.unloadable.len(), 1);
    let failure = loaded.unloadable.first().unwrap();
    assert_eq!(failure.directory.to_string(), "cs454/broken");
    assert_eq!(failure.error.code(), "ERR_STORED_FILE_UNREADABLE");

    // And the damaged bytes were preserved on the way past.
    assert!(
        dir.path().join("cs454/broken/manifest.json.bak").exists(),
        "a corrupt manifest should have been copied aside"
    );
}

#[test]
fn a_bundle_s_own_subfolders_are_not_walked_as_lectures() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/raft", "Raft Consensus");
    fs::create_dir_all(dir.path().join("cs454/raft/source")).unwrap();
    fs::create_dir_all(dir.path().join("cs454/raft/assets/figures")).unwrap();

    let loaded = loader(dir.path()).load().unwrap();

    assert_eq!(loaded.bundles.len(), 1);
    assert!(loaded.skipped.is_empty(), "{:?}", loaded.skipped);
}

#[test]
fn the_nexus_cache_directory_is_ignored_without_comment() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/raft", "Raft Consensus");
    fs::create_dir_all(dir.path().join(".nexus/thumbnails")).unwrap();
    fs::write(dir.path().join(".DS_Store"), b"\0").unwrap();

    let loaded = loader(dir.path()).load().unwrap();

    assert_eq!(loaded.bundles.len(), 1);
    assert!(loaded.skipped.is_empty(), "{:?}", loaded.skipped);
}

#[test]
fn lists_a_real_directory_through_the_port() {
    // The adapter's own contract, separate from the walk that consumes it.
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/raft", "Raft Consensus");

    let listing = FsVaultDirectory::new(VaultRoot::open(dir.path()).unwrap());
    let root = listing.list(None).unwrap();

    assert_eq!(root.len(), 1);
    let entry = root.first().unwrap();
    assert_eq!(entry.name, "cs454");
    assert!(entry.is_directory());

    let lecture = RelativePath::parse("cs454/raft").unwrap();
    let inside = listing.list(Some(&lecture)).unwrap();
    let manifest_entry = inside
        .iter()
        .find(|e| e.name == "manifest.json")
        .expect("the manifest should be listed");
    assert!(
        !manifest_entry.is_directory(),
        "manifest.json is a file, and the walk relies on that"
    );
}
