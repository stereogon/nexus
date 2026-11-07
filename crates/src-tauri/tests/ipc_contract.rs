//! The shape the UI receives over IPC, pinned as a committed fixture.
//!
//! # Why this exists
//!
//! `VaultSummary` is described twice: once by the Rust structs that serialise it, and once
//! by the Zod schemas in `src/ipc/vault.ts` that validate it before the UI trusts a field
//! (`CLAUDE.md` §4). Two descriptions of one shape are free to drift, and the drift would
//! surface as a blank sidebar in front of someone trying to study.
//!
//! The same answer `wire_format.rs` gives for the on-disk files: write the shape down once,
//! as a fixture, and hold both sides to it.
//!
//! - This test asserts the real `open_vault` command still produces that shape, by running
//!   it against a real vault on disk rather than hand-building a summary. A hand-built one
//!   would pin the struct and prove nothing about the command.
//! - `src/ipc/ipc.test.ts` asserts the Zod schemas accept exactly those bytes.
//!
//! # What it pins, precisely
//!
//! Field names, types and nullability -- not byte-for-byte what crosses the wire. Going
//! through `serde_json::to_value` sorts the keys, where serialising the struct straight to
//! bytes would keep declaration order. Harmless, because JSON objects are unordered and Zod
//! does not care, but worth stating rather than letting "matches the fixture" be read as a
//! stronger claim than it is.
//!
//! # Regenerating
//!
//! ```text
//! UPDATE_FIXTURES=1 cargo test -p nexus-app --test ipc_contract
//! ```
//!
//! Then read the diff before committing it.

// Indexing is allowed here alongside the usual test overrides sanctioned in `Cargo.toml`:
// these assertions are about a known fixture, so `unloadable[0]` says what it means and
// can panic no more readily than the `unwrap`s already permitted above it.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use std::fs;
use std::path::{Path, PathBuf};

use lecture_core::{
    Conversion, Facets, Fingerprint, FixedClock, Label, Manifest, OrderKey, RelativePath, Source,
    Timestamp,
};
use lecture_fs::{AtomicFsStorage, ManifestStore, VaultRoot};
use nexus_app::vault::open_vault;
use tempfile::TempDir;

const CREATED: &str = "2026-10-27T16:00:00Z";

/// The stand-in for the vault's absolute path in the fixture.
///
/// The real one is a temporary directory and differs every run, so pinning it would make
/// the fixture unpinnable. Substituted rather than omitted, so the field is still proven to
/// be present and a string.
const ROOT_PLACEHOLDER: &str = "<vault>";

fn label(raw: &str) -> Label {
    Label::parse(raw).unwrap()
}

fn at(raw: &str) -> Timestamp {
    Timestamp::parse(raw).unwrap()
}

fn store(root: &Path) -> ManifestStore<FixedClock> {
    ManifestStore::new(
        AtomicFsStorage::new(VaultRoot::open(root).unwrap()),
        FixedClock::new(at(CREATED)),
    )
}

/// A lecture imported from `PowerPoint`, with every facet filled in.
fn converted_manifest() -> Manifest {
    let source = Source::new(
        RelativePath::parse("source/document.pdf").unwrap(),
        Some(RelativePath::parse("source/original.pptx").unwrap()),
        Conversion::ready(label("libreoffice"), at(CREATED)),
    )
    .unwrap()
    .with_fingerprints(
        Some(Fingerprint::of(b"the rendered pdf")),
        Some(Fingerprint::of(b"the imported pptx")),
    )
    .unwrap();

    Manifest::new(
        label("Raft Consensus"),
        OrderKey::first(),
        source,
        at(CREATED),
    )
    .with_facets(
        Facets::default()
            .with_course(label("CS454 Distributed Systems"))
            .with_module(label("Consensus"))
            .with_week(label("Week 3"))
            .with_tags(vec![label("exam"), label("consensus")]),
    )
}

/// A lecture that was already a PDF and has no taxonomy at all.
///
/// Present so the fixture exercises the `null` facets and the empty tag list. A fixture in
/// which every optional field is filled proves nothing about whether the other language
/// copes when they are not.
fn plain_manifest() -> Manifest {
    let source = Source::new(
        RelativePath::parse("source/document.pdf").unwrap(),
        None,
        Conversion::not_required(),
    )
    .unwrap();

    Manifest::new(
        label("Paxos Made Simple"),
        OrderKey::between(Some(&OrderKey::first()), None).unwrap(),
        source,
        at(CREATED),
    )
}

/// A vault holding two good lectures and one whose manifest cannot be parsed.
fn vault() -> TempDir {
    let held = TempDir::new().unwrap();
    let root = held.path().join("vault");
    fs::create_dir_all(&root).unwrap();

    // `ManifestStore::save` writes atomically *into* a directory and does not create one:
    // making the bundle layout is the importer's job, not the store's.
    for bundle in ["cs454/01-raft", "cs454/02-paxos", "cs454/summary"] {
        fs::create_dir_all(root.join(bundle)).unwrap();
    }

    let manifests = store(&root);
    manifests
        .save(
            &RelativePath::parse("cs454/01-raft").unwrap(),
            &converted_manifest(),
        )
        .unwrap();
    manifests
        .save(
            &RelativePath::parse("cs454/02-paxos").unwrap(),
            &plain_manifest(),
        )
        .unwrap();

    // A plain note, so the fixture carries `kind: "note"` and a row with no document.
    manifests
        .save(
            &RelativePath::parse("cs454/summary").unwrap(),
            &Manifest::note(
                label("Summary"),
                OrderKey::between(Some(&OrderKey::first()), None)
                    .and_then(|after| OrderKey::between(Some(&after), None))
                    .unwrap(),
                at(CREATED),
            ),
        )
        .unwrap();

    // An empty folder, which must still be listed: the sidebar steps into folders, and one
    // made a moment ago has nothing in it yet.
    fs::create_dir_all(root.join("cs454").join("reading")).unwrap();

    // A lecture by the one rule that defines one -- a directory holding `manifest.json` --
    // whose manifest is not readable. It must land in `unloadable` and cost the vault
    // nothing else.
    let broken = root.join("cs454").join("03-truncated");
    fs::create_dir_all(&broken).unwrap();
    fs::write(broken.join("manifest.json"), b"{\"schemaVersion\":").unwrap();

    held
}

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/vault-summary.json")
}

#[test]
fn the_vault_summary_matches_its_committed_fixture() {
    let held = vault();
    let root = held.path().join("vault");

    let summary = open_vault(&root.display().to_string()).expect("the vault should open");
    let mut json = serde_json::to_value(&summary).unwrap();
    json["root"] = serde_json::Value::String(ROOT_PLACEHOLDER.to_owned());

    let mut actual = serde_json::to_vec_pretty(&json).unwrap();
    actual.push(b'\n');

    let path = fixture_path();

    if std::env::var_os("UPDATE_FIXTURES").is_some() {
        fs::write(&path, &actual).unwrap();
        return;
    }

    let expected = fs::read(&path).unwrap_or_else(|e| {
        panic!(
            "cannot read fixture {}: {e}\n\
             regenerate with: UPDATE_FIXTURES=1 cargo test -p nexus-app --test ipc_contract",
            path.display()
        )
    });

    assert_eq!(
        String::from_utf8_lossy(&actual),
        String::from_utf8_lossy(&expected),
        "the IPC shape changed; regenerate the fixture on purpose and check the Zod schemas"
    );
}

#[test]
fn one_unreadable_manifest_does_not_cost_the_vault_its_other_lectures() {
    // The property the three lists exist for, asserted directly rather than left implied
    // by the fixture.
    let held = vault();
    let summary = open_vault(&held.path().join("vault").display().to_string()).unwrap();

    // Two documents and a note.
    assert_eq!(summary.lectures.len(), 3);
    assert_eq!(summary.unloadable.len(), 1);
    assert!(
        summary.unloadable[0].directory.contains("03-truncated"),
        "the unreadable lecture should be named, not just counted"
    );
    assert!(
        !summary.unloadable[0].remediation.is_empty(),
        "every problem must carry a sentence saying what to do next"
    );
}

#[test]
fn a_path_that_is_not_a_vault_fails_with_a_code_and_a_remediation() {
    let held = TempDir::new().unwrap();
    let missing = held.path().join("there-is-nothing-here");

    let error = open_vault(&missing.display().to_string()).expect_err("should not open");

    assert!(error.code.starts_with("ERR_"), "code was {}", error.code);
    assert!(!error.remediation.is_empty());
    // §4: a path contains course and lecture titles, so it must not ride along to the UI
    // where a webview console could log it.
    assert!(
        !error.remediation.contains("there-is-nothing-here"),
        "the remediation leaked the path: {}",
        error.remediation
    );
}
