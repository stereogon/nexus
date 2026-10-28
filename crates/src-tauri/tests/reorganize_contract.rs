//! The reorganize shapes the UI receives, pinned as a committed fixture.
//!
//! The same argument as `ipc_contract.rs`: these shapes are described twice, once by the
//! Rust structs and once by the Zod schemas in `src/ipc/reorganize.ts`, and two
//! descriptions of one shape are free to drift. The drift would surface as a reorganize
//! panel that refuses to open in front of someone trying to tidy their vault.
//!
//! This one earned its keep immediately: the schema was first written with `stopped_by`
//! where `rename_all = "camelCase"` produces `stoppedBy`.
//!
//! - This test asserts the real `preview` and `apply` still produce that shape, by running
//!   them against a real vault rather than hand-building the structs.
//! - `src/ipc/reorganize.test.ts` asserts the Zod schemas accept exactly those bytes.
//!
//! # Regenerating
//!
//! ```text
//! UPDATE_FIXTURES=1 cargo test -p nexus-app --test reorganize_contract
//! ```
//!
//! Then read the diff before committing it.

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
use nexus_app::reorganize::{apply_under, preview};
use tempfile::TempDir;

const TEMPLATE: &str = "{course}/{week}-{title}";
const CREATED: &str = "2026-10-27T16:00:00Z";

/// A vault holding one of each outcome, so the pinned shape covers all of them.
///
/// One lecture that moves, one with no facets at all (blocked, and `wanted` is null), and
/// two that render to the same folder (blocked, with a `wanted` to show).
fn vault() -> TempDir {
    let held = TempDir::new().unwrap();
    let root = held.path().join("vault");
    fs::create_dir_all(&root).unwrap();

    write_lecture(&root, "raft", "Raft Consensus", Some(("CS454", "Week 3")));
    write_lecture(&root, "unfiled", "Orientation", None);
    write_lecture(&root, "first", "Paxos", Some(("CS454", "Week 5")));
    write_lecture(&root, "second", "Paxos", Some(("CS454", "Week 5")));

    held
}

fn write_lecture(root: &Path, directory: &str, title: &str, filed: Option<(&str, &str)>) {
    let at = RelativePath::parse(directory).unwrap();
    let storage = AtomicFsStorage::new(VaultRoot::open(root).unwrap());
    storage.create_dir(&at).unwrap();

    let facets = match filed {
        Some((course, week)) => Facets::empty()
            .with_course(Label::parse(course).unwrap())
            .with_week(Label::parse(week).unwrap()),
        None => Facets::empty(),
    };

    let source = Source::new(
        RelativePath::parse("source/document.pdf").unwrap(),
        None,
        Conversion::not_required(),
    )
    .unwrap()
    .with_fingerprints(Some(Fingerprint::of(b"%PDF-1.7 a lecture")), None)
    .unwrap();

    let manifest = Manifest::new(
        Label::parse(title).unwrap(),
        OrderKey::parse("a0").unwrap(),
        source,
        Timestamp::parse(CREATED).unwrap(),
    )
    .with_facets(facets);

    ManifestStore::new(storage, FixedClock::new(Timestamp::parse(CREATED).unwrap()))
        .save(&at, &manifest)
        .unwrap();
}

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/reorganize.json")
}

#[test]
fn the_reorganize_shapes_match_their_committed_fixture() {
    let held = vault();
    let root = held.path().join("vault");
    let state = held.path().join("state");
    let vault_path = root.display().to_string();

    let preview = preview(&vault_path, TEMPLATE).expect("the preview should run");
    // Applied second, so the preview above is of an untouched vault.
    let result = apply_under(&state, &vault_path, TEMPLATE).expect("the apply should run");

    let json = serde_json::json!({ "preview": preview, "result": result });
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
             regenerate with: UPDATE_FIXTURES=1 cargo test -p nexus-app --test reorganize_contract",
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
fn the_fixture_covers_every_outcome_it_is_meant_to() {
    // A fixture that quietly stopped exercising the blocked cases would still pass the test
    // above while pinning less than it claims to.
    let held = vault();
    let root = held.path().join("vault");

    let preview = preview(&root.display().to_string(), TEMPLATE).unwrap();

    assert_eq!(preview.moves.len(), 1, "a move must be covered");
    assert_eq!(
        preview.blocked.len(),
        3,
        "both block reasons must be covered"
    );
    assert!(
        preview.blocked.iter().any(|b| b.wanted.is_none()),
        "a null `wanted` must be covered"
    );
    assert!(
        preview.blocked.iter().any(|b| b.wanted.is_some()),
        "and a present one"
    );
}
