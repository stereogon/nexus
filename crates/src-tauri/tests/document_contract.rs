//! The document payload, pinned against bytes the TypeScript side parses.
//!
//! One half of a pair: this writes `fixtures/document.json` by running the real command,
//! and `src/ipc/document.test.ts` asserts Zod accepts those exact bytes. A schema written
//! from reading the Rust struct agrees with it only until someone edits one of them.
//!
//! Regenerate with:
//!
//! ```text
//! UPDATE_FIXTURES=1 cargo test -p nexus-app --test document_contract
//! ```
//!
//! # The absolute path is replaced before comparing
//!
//! `path` is where the file is on *this* machine, inside a temporary directory that differs
//! every run, so it cannot be committed. It is replaced with a fixed path of the same
//! shape. What this pins is the payload's structure and every value derived from the
//! document itself — the sizes, the codes, the severities, the flag — which is what the two
//! sides can actually disagree about.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::path::{Path, PathBuf};

use lecture_core::{
    Conversion, FixedClock, Label, Manifest, OrderKey, RelativePath, Source, Timestamp,
};
use lecture_fs::{AtomicFsStorage, ManifestStore, VaultRoot};
use nexus_app::document::prepare_document;
use tempfile::TempDir;

const CREATED: &str = "2026-10-27T16:00:00Z";

/// A lecture whose document holds exactly `bytes`.
fn write_lecture(root: &Path, directory: &str, title: &str, bytes: &[u8]) {
    let at = RelativePath::parse(directory).unwrap();
    let storage = AtomicFsStorage::new(VaultRoot::open(root).unwrap());
    storage.create_dir(&at).unwrap();

    let source = Source::new(
        RelativePath::parse("source/document.pdf").unwrap(),
        None,
        Conversion::not_required(),
    )
    .unwrap();

    let manifest = Manifest::new(
        Label::parse(title).unwrap(),
        OrderKey::parse("a0").unwrap(),
        source,
        Timestamp::parse(CREATED).unwrap(),
    );

    ManifestStore::new(
        AtomicFsStorage::new(VaultRoot::open(root).unwrap()),
        FixedClock::new(Timestamp::parse(CREATED).unwrap()),
    )
    .save(&at, &manifest)
    .unwrap();

    let folder = root.join(directory).join("source");
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("document.pdf"), bytes).unwrap();
}

/// The payload with its machine-specific path replaced. See the module note.
fn with_a_fixed_path(mut payload: serde_json::Value) -> serde_json::Value {
    if let Some(object) = payload.as_object_mut() {
        object.insert(
            "path".to_owned(),
            serde_json::json!("/vault/raft/source/document.pdf"),
        );
    }

    payload
}

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/document.json")
}

#[test]
fn the_document_shapes_match_their_committed_fixture() {
    let held = TempDir::new().unwrap();
    let root = held.path().join("vault");
    fs::create_dir_all(&root).unwrap();
    let vault = root.display().to_string();

    // One document with nothing in it, and one asking for most of what a PDF can ask for.
    // A fixture where every list is empty proves nothing about the side that renders them.
    write_lecture(
        &root,
        "clean",
        "Orientation",
        b"%PDF-1.7\n<</Type/Catalog>>\n",
    );
    write_lecture(
        &root,
        "flagged",
        "Raft Consensus",
        b"%PDF-1.7\n<</OpenAction<</S/J#61vaScript/JS 1 0 R>>/Names[/EmbeddedFile]\
          /Annots[<</A<</URI(http://x)>>>>]/XFA 9 0 R>>\n",
    );

    let json = serde_json::json!({
        "clean": with_a_fixed_path(
            serde_json::to_value(prepare_document(&vault, "clean").unwrap()).unwrap(),
        ),
        "flagged": with_a_fixed_path(
            serde_json::to_value(prepare_document(&vault, "flagged").unwrap()).unwrap(),
        ),
    });

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
             regenerate with: UPDATE_FIXTURES=1 cargo test -p nexus-app --test document_contract",
            path.display()
        )
    });

    assert_eq!(
        String::from_utf8_lossy(&actual),
        String::from_utf8_lossy(&expected),
        "the document payload changed shape; regenerate the fixture and update the Zod \
         schema in src/ipc/document.ts in the same change"
    );
}
