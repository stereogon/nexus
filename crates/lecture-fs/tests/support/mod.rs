//! Shared scaffolding for the renumber tests.
//!
//! Lives here rather than being duplicated because `write_lecture` has to build a whole
//! valid bundle — a manifest with a real `sequence` — and two copies of that would drift.
//!
//! `pub(crate)` rather than `pub`: inside a test binary that is the right visibility, and
//! it satisfies `unreachable_pub` honestly instead of with an `allow`.

use std::fs;
use std::path::Path;

use lecture_core::{
    Conversion, FixedClock, Label, Manifest, OrderKey, RelativePath, Source, Timestamp,
};
use lecture_fs::{AtomicFsStorage, ManifestStore, VaultRenumber, VaultRoot};

const NOW: &str = "2026-10-28T09:30:00Z";

pub(crate) fn at(raw: &str) -> Timestamp {
    Timestamp::parse(raw).unwrap()
}

pub(crate) fn path(raw: &str) -> RelativePath {
    RelativePath::parse(raw).unwrap()
}

pub(crate) fn storage(root: &Path) -> AtomicFsStorage {
    AtomicFsStorage::new(VaultRoot::open(root).unwrap())
}

pub(crate) fn manifests(root: &Path) -> ManifestStore<FixedClock> {
    ManifestStore::new(storage(root), FixedClock::new(at(NOW)))
}

pub(crate) fn renumber(root: &Path) -> VaultRenumber<FixedClock> {
    VaultRenumber::new(manifests(root))
}

/// Writes a lecture whose `sequence` is `sequence`.
pub(crate) fn write_lecture(root: &Path, directory: &str, title: &str, sequence: &str) {
    let at_path = path(directory);
    storage(root).create_dir(&at_path).unwrap();

    let source = Source::new(
        path("source/document.pdf"),
        None,
        Conversion::not_required(),
    )
    .unwrap();

    let manifest = Manifest::new(
        Label::parse(title).unwrap(),
        OrderKey::parse(sequence).unwrap(),
        source,
        at("2026-10-27T16:00:00Z"),
    );

    manifests(root).save(&at_path, &manifest).unwrap();
}

/// The folder names directly inside `at`, sorted.
pub(crate) fn names_in(root: &Path, at: &str) -> Vec<String> {
    let mut found: Vec<String> = fs::read_dir(root.join(at))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    found.sort();
    found
}
