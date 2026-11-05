//! Contract tests for `AssetStore` — images pasted into notes, against a real filesystem.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;

use lecture_core::{MAX_ASSET_BYTES, RelativePath, Timestamp};
use lecture_fs::{AssetSave, AssetStore, AtomicFsStorage, Refusal, VaultRoot};
use tempfile::TempDir;

const BUNDLE: &str = "cs454/raft-consensus";
const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4];

fn new_store() -> (TempDir, AssetStore) {
    let dir = TempDir::new().unwrap();
    let storage = AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap());
    storage
        .create_dir(&RelativePath::parse(BUNDLE).unwrap())
        .unwrap();

    (dir, AssetStore::new(storage))
}

fn now() -> Timestamp {
    Timestamp::parse("2026-11-05T10:15:30Z").unwrap()
}

fn saved_path(outcome: AssetSave) -> String {
    match outcome {
        AssetSave::Saved { path } => path,
        AssetSave::Refused { reason } => {
            panic!("expected the image to be kept, refused: {reason:?}")
        }
    }
}

#[test]
fn an_image_is_kept_in_the_assets_folder_byte_for_byte() {
    let (dir, store) = new_store();

    let path = saved_path(
        store
            .save(&RelativePath::parse(BUNDLE).unwrap(), PNG, &now())
            .unwrap(),
    );

    assert!(path.starts_with("assets/20261105-101530-"), "{path}");
    assert_eq!(
        std::path::Path::new(&path).extension(),
        Some("png".as_ref())
    );
    assert_eq!(fs::read(dir.path().join(BUNDLE).join(&path)).unwrap(), PNG);
}

#[test]
fn the_same_picture_pasted_twice_is_one_file() {
    let (dir, store) = new_store();
    let bundle = RelativePath::parse(BUNDLE).unwrap();

    let first = saved_path(store.save(&bundle, PNG, &now()).unwrap());
    let second = saved_path(store.save(&bundle, PNG, &now()).unwrap());

    assert_eq!(first, second);
    assert_eq!(
        fs::read_dir(dir.path().join(BUNDLE).join("assets"))
            .unwrap()
            .count(),
        1
    );
}

#[test]
fn something_that_is_not_an_image_is_turned_away_and_nothing_is_written() {
    let (dir, store) = new_store();

    let outcome = store
        .save(
            &RelativePath::parse(BUNDLE).unwrap(),
            b"<svg><script/></svg>",
            &now(),
        )
        .unwrap();

    assert_eq!(
        outcome,
        AssetSave::Refused {
            reason: Refusal::NotAnImage
        }
    );
    assert!(!dir.path().join(BUNDLE).join("assets").exists());
}

#[test]
fn an_image_too_large_is_turned_away() {
    let (_dir, store) = new_store();
    let mut huge = PNG.to_vec();
    huge.resize(MAX_ASSET_BYTES + 1, 0);

    let outcome = store
        .save(&RelativePath::parse(BUNDLE).unwrap(), &huge, &now())
        .unwrap();

    assert_eq!(
        outcome,
        AssetSave::Refused {
            reason: Refusal::TooLarge
        }
    );
}

#[test]
fn the_outcome_crosses_to_the_window_in_the_shape_it_expects() {
    // The other half is the Zod schema in `src/ipc/assets.ts`.
    assert_eq!(
        serde_json::to_value(AssetSave::Saved {
            path: "assets/a.png".to_owned()
        })
        .unwrap(),
        serde_json::json!({ "outcome": "saved", "path": "assets/a.png" })
    );
    assert_eq!(
        serde_json::to_value(AssetSave::Refused {
            reason: Refusal::NotAnImage
        })
        .unwrap(),
        serde_json::json!({ "outcome": "refused", "reason": "notAnImage" })
    );
}
