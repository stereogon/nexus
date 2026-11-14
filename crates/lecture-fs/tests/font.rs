//! The font preference, round-tripped through real files.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::fs;

use lecture_fs::font::{FONT_FILE_NAME, Font, recall, remember};
use tempfile::TempDir;

#[test]
fn a_recorded_font_comes_back() {
    let dir = TempDir::new().unwrap();
    let base = dir.path().join("Application Support").join("Nexus");

    remember(&base, Font::Readable).unwrap();
    assert_eq!(recall(&base), Font::Readable);

    remember(&base, Font::Mono).unwrap();
    assert_eq!(recall(&base), Font::Mono);

    remember(&base, Font::Theme).unwrap();
    assert_eq!(recall(&base), Font::Theme);
}

#[test]
fn nothing_recorded_or_unreadable_means_the_themes() {
    let dir = TempDir::new().unwrap();

    assert_eq!(recall(dir.path()), Font::Theme);
    assert_eq!(recall(&dir.path().join("never-created")), Font::Theme);

    fs::write(dir.path().join(FONT_FILE_NAME), "comic\n").unwrap();
    assert_eq!(recall(dir.path()), Font::Theme);
}

#[test]
fn the_stored_word_is_what_the_window_sends() {
    assert_eq!(
        serde_json::to_string(&Font::Readable).unwrap(),
        "\"readable\""
    );
    assert_eq!(
        serde_json::from_str::<Font>("\"mono\"").unwrap(),
        Font::Mono
    );
    assert!(serde_json::from_str::<Font>("\"comic\"").is_err());
}
