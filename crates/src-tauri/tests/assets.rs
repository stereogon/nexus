//! Images pasted into notes, through the command's testable halves.
//!
//! What cannot be driven here is the raw-body request itself, which needs a running
//! Tauri; its two parts that carry rules — the lecture header and the store — are.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;

use lecture_core::{FixedClock, RelativePath, Timestamp};
use lecture_fs::{AssetSave, AtomicFsStorage, Refusal, VaultRoot};
use nexus_app::assets::{Lecture, lecture_from_header, store_asset};
use tempfile::TempDir;

const BUNDLE: &str = "cs454/raft-consensus";
const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 9, 9];

#[test]
fn the_lecture_header_brings_back_a_name_outside_ascii() {
    // A header must be ASCII and a course name need not be, so the window escapes.
    let header = r#"{"vault":"/Users/me/Études","directory":"week-2/réseaux"}"#;

    assert_eq!(
        lecture_from_header(header),
        Some(Lecture {
            vault: "/Users/me/Études".to_owned(),
            directory: "week-2/réseaux".to_owned()
        })
    );
}

#[test]
fn a_header_that_is_not_the_window_s_json_is_refused() {
    assert_eq!(lecture_from_header("not json"), None);
    assert_eq!(lecture_from_header(r#"{"vault":"/v"}"#), None);
}

#[test]
fn a_pasted_image_is_kept_and_its_path_returned() {
    let dir = TempDir::new().unwrap();
    AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap())
        .create_dir(&RelativePath::parse(BUNDLE).unwrap())
        .unwrap();
    let clock = FixedClock::new(Timestamp::parse("2026-11-05T10:15:30Z").unwrap());

    let AssetSave::Saved { path } =
        store_asset(dir.path().to_str().unwrap(), BUNDLE, PNG, &clock).unwrap()
    else {
        panic!("expected the image to be kept");
    };

    assert_eq!(fs::read(dir.path().join(BUNDLE).join(path)).unwrap(), PNG);
}

#[test]
fn a_pasted_document_is_turned_away() {
    let dir = TempDir::new().unwrap();
    AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap())
        .create_dir(&RelativePath::parse(BUNDLE).unwrap())
        .unwrap();
    let clock = FixedClock::new(Timestamp::parse("2026-11-05T10:15:30Z").unwrap());

    assert_eq!(
        store_asset(dir.path().to_str().unwrap(), BUNDLE, b"%PDF-1.7", &clock).unwrap(),
        AssetSave::Refused {
            reason: Refusal::NotAnImage
        }
    );
}
