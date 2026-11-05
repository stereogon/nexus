//! Images dropped onto the notes, through the command's testable half.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;

use lecture_core::{FixedClock, MAX_ASSET_BYTES, RelativePath, Timestamp};
use lecture_fs::{AssetSave, AtomicFsStorage, Refusal, VaultRoot};
use nexus_app::dropped_image::keep_dropped_image;
use tempfile::TempDir;

const BUNDLE: &str = "cs454/raft-consensus";
const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 9, 9];

/// A vault with one lecture, and a separate folder standing for the Desktop.
fn setup() -> (TempDir, TempDir) {
    let vault = TempDir::new().unwrap();
    AtomicFsStorage::new(VaultRoot::open(vault.path()).unwrap())
        .create_dir(&RelativePath::parse(BUNDLE).unwrap())
        .unwrap();

    (vault, TempDir::new().unwrap())
}

fn clock() -> FixedClock {
    FixedClock::new(Timestamp::parse("2026-11-05T10:15:30Z").unwrap())
}

#[test]
fn a_dropped_image_is_copied_into_the_lecture_and_its_path_returned() {
    let (vault, desktop) = setup();
    let screenshot = desktop.path().join("Screenshot 2026-11-05.png");
    fs::write(&screenshot, PNG).unwrap();

    let AssetSave::Saved { path } = keep_dropped_image(
        vault.path().to_str().unwrap(),
        BUNDLE,
        &screenshot,
        &clock(),
    )
    .unwrap() else {
        panic!("expected the image to be kept");
    };

    assert!(path.starts_with("assets/"));
    assert_eq!(fs::read(vault.path().join(BUNDLE).join(path)).unwrap(), PNG);
    // Copied, not moved: the person's file is where they left it.
    assert_eq!(fs::read(&screenshot).unwrap(), PNG);
}

#[test]
fn a_dropped_document_is_turned_away_whatever_it_is_called() {
    let (vault, desktop) = setup();
    let pretender = desktop.path().join("slides.png");
    fs::write(&pretender, b"%PDF-1.7 not an image").unwrap();

    let saved = keep_dropped_image(vault.path().to_str().unwrap(), BUNDLE, &pretender, &clock());

    assert_eq!(
        saved.unwrap(),
        AssetSave::Refused {
            reason: Refusal::NotAnImage
        }
    );
}

#[test]
fn a_file_too_large_is_turned_away_before_it_is_read() {
    // Sparse: as large as it claims on paper, with nothing to read.
    let (vault, desktop) = setup();
    let huge = desktop.path().join("lecture-recording.png");
    let file = fs::File::create(&huge).unwrap();
    file.set_len(u64::try_from(MAX_ASSET_BYTES).unwrap() + 1)
        .unwrap();

    let saved = keep_dropped_image(vault.path().to_str().unwrap(), BUNDLE, &huge, &clock());

    assert_eq!(
        saved.unwrap(),
        AssetSave::Refused {
            reason: Refusal::TooLarge
        }
    );
    assert!(!vault.path().join(BUNDLE).join("assets").exists());
}

#[test]
fn a_file_that_cannot_be_read_says_so() {
    let (vault, desktop) = setup();
    let root = vault.path().to_str().unwrap();

    for unreadable in [
        desktop.path().join("gone.png"),
        desktop.path().to_path_buf(),
    ] {
        let error = keep_dropped_image(root, BUNDLE, &unreadable, &clock()).unwrap_err();

        assert_eq!(
            error.code, "ERR_DROPPED_IMAGE_UNREADABLE",
            "for {unreadable:?}"
        );
    }
}
