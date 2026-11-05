//! One half of a pair: this writes `fixtures/search.json` by running the real search and
//! highlights-library commands, and `src/ipc/search.test.ts` checks the Zod schemas accept
//! exactly those bytes. If the shape changes, both halves change in the same commit.
//!
//! ```text
//! UPDATE_FIXTURES=1 cargo test -p nexus-app --test search_contract
//! ```

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::path::PathBuf;

use lecture_core::{FixedClock, HighlightSemantic, RelativePath, SequentialIds, Timestamp};
use lecture_fs::{AtomicFsStorage, VaultRoot};
use nexus_app::annotations::{NewHighlight, write_highlight};
use nexus_app::search::{find_in_vault, marks_in_vault};
use tempfile::TempDir;

const RAFT: &str = "cs454/raft";
const BROKEN: &str = "cs454/broken";

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/search.json")
}

#[test]
fn the_search_payloads_match_the_committed_fixture() {
    let dir = TempDir::new().unwrap();
    let root = dir.path().to_str().unwrap();
    let storage = AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap());

    for bundle in [RAFT, BROKEN] {
        storage
            .create_dir(&RelativePath::parse(bundle).unwrap())
            .unwrap();
    }

    fs::write(
        dir.path().join(RAFT).join("notes.md"),
        "# Raft\n\nA leader is elected.\n",
    )
    .unwrap();
    fs::write(
        dir.path().join(BROKEN).join("annotations.json"),
        "{ not json",
    )
    .unwrap();
    write_highlight(
        root,
        RAFT,
        NewHighlight {
            page: 3,
            semantic: HighlightSemantic::Exam,
            quote: "The Leader Completeness property".to_owned(),
            rects: vec![
                serde_json::from_str(r#"{"x":0.1,"y":0.2,"width":0.5,"height":0.03}"#).unwrap(),
            ],
        },
        &SequentialIds::new("hl-"),
        &FixedClock::new(Timestamp::parse("2026-11-05T09:00:00Z").unwrap()),
    )
    .unwrap();

    let lectures = vec![RAFT.to_owned(), BROKEN.to_owned()];
    let json = serde_json::json!({
        "search": find_in_vault(root, &lectures, "leader").unwrap(),
        "highlights": marks_in_vault(root, &lectures).unwrap(),
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
             regenerate with: UPDATE_FIXTURES=1 cargo test -p nexus-app --test search_contract",
            path.display()
        )
    });

    assert_eq!(
        String::from_utf8_lossy(&actual),
        String::from_utf8_lossy(&expected),
        "the search payload changed shape; regenerate the fixture and update the Zod schemas \
         in src/ipc/search.ts in the same change"
    );
}
