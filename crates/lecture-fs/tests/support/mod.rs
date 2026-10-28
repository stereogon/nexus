//! Shared scaffolding for the renumber and reorganize tests.
//!
//! Lives here rather than being duplicated because `write_lecture` has to build a whole
//! valid bundle — a manifest with a real `sequence` — and two copies of that would drift.
//!
//! `pub(crate)` rather than `pub`: inside a test binary that is the right visibility, and
//! it satisfies `unreachable_pub` honestly instead of with an `allow`.

// Cargo compiles this module separately into each test binary that includes it, so a
// helper only the reorganize tests need reads as dead code while compiling the renumber
// ones. The same `allow` and the same reasoning as `lecture-core/tests/support/mod.rs`: a
// shared harness legitimately has parts one consumer does not use, and every helper below
// is used by at least one test file. The cost is real but small -- a helper that became
// unused by *all* of them would not be caught here -- which is why this module holds only
// primitives and the specific fixtures live in the test files.

#![allow(dead_code)]

use std::fs;
use std::path::Path;

use lecture_core::{
    Conversion, Facets, FixedClock, Label, Manifest, OrderKey, RelativePath, Source, Timestamp,
};
use lecture_fs::{
    AtomicFsStorage, LoadedVault, ManifestStore, VaultLoader, VaultRenumber, VaultReorganize,
    VaultRoot,
};

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

pub(crate) fn reorganize(root: &Path) -> VaultReorganize<FixedClock> {
    VaultReorganize::new(manifests(root))
}

pub(crate) fn load(root: &Path) -> LoadedVault {
    VaultLoader::new(manifests(root)).load().unwrap()
}

/// Writes a lecture filed under a course and a week, which is what a template renders from.
pub(crate) fn write_filed_lecture(
    root: &Path,
    directory: &str,
    title: &str,
    course: &str,
    week: &str,
) {
    write_with(
        root,
        directory,
        title,
        "a0",
        Facets::empty()
            .with_course(Label::parse(course).unwrap())
            .with_week(Label::parse(week).unwrap()),
    );
}

/// Writes a lecture whose `sequence` is `sequence`.
pub(crate) fn write_lecture(root: &Path, directory: &str, title: &str, sequence: &str) {
    write_with(root, directory, title, sequence, Facets::empty());
}

/// The one place a bundle is actually built, so the two helpers above cannot drift.
fn write_with(root: &Path, directory: &str, title: &str, sequence: &str, facets: Facets) {
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
    )
    .with_facets(facets);

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
