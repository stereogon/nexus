//! One half of a pair: this writes `fixtures/notes.json` by running the real notes
//! commands, and `src/ipc/notes.test.ts` checks the Zod schemas accept exactly those
//! bytes. If the shape changes, both halves change in the same commit.
//!
//! ```text
//! UPDATE_FIXTURES=1 cargo test -p nexus-app --test notes_contract
//! ```

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::path::PathBuf;

use lecture_core::RelativePath;
use lecture_fs::{AtomicFsStorage, VaultRoot};
use nexus_app::notes::{read_notes, write_notes};
use tempfile::TempDir;

const BUNDLE: &str = "cs454/raft-consensus";

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/notes.json")
}

#[test]
fn the_notes_payloads_match_the_committed_fixture() {
    let dir = TempDir::new().unwrap();
    AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap())
        .create_dir(&RelativePath::parse(BUNDLE).unwrap())
        .unwrap();
    let root = dir.path().to_str().unwrap();

    let empty = read_notes(root, BUNDLE).unwrap();
    let saved = write_notes(root, BUNDLE, "# Week 2\n", &empty.version).unwrap();
    let loaded = read_notes(root, BUNDLE).unwrap();
    let conflict = write_notes(root, BUNDLE, "from elsewhere\n", &empty.version).unwrap();

    let json = serde_json::json!({
        "empty": empty,
        "loaded": loaded,
        "saved": saved,
        "conflict": conflict,
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
             regenerate with: UPDATE_FIXTURES=1 cargo test -p nexus-app --test notes_contract",
            path.display()
        )
    });

    assert_eq!(
        String::from_utf8_lossy(&actual),
        String::from_utf8_lossy(&expected),
        "the notes payload changed shape; regenerate the fixture and update the Zod schemas \
         in src/ipc/notes.ts in the same change"
    );
}
