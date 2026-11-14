//! The page-tone preference, round-tripped through real files.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::fs;

use lecture_fs::page_tone::{PAGE_TONE_FILE_NAME, PageTone, recall, remember};
use tempfile::TempDir;

#[test]
fn a_recorded_tone_comes_back() {
    let dir = TempDir::new().unwrap();
    let base = dir.path().join("Application Support").join("Nexus");

    for tone in [PageTone::Sepia, PageTone::Dusk, PageTone::Night] {
        remember(&base, tone).unwrap();
        assert_eq!(recall(&base), tone);
    }

    remember(&base, PageTone::Printed).unwrap();
    assert_eq!(recall(&base), PageTone::Printed);
}

#[test]
fn nothing_recorded_or_unreadable_means_as_printed() {
    let dir = TempDir::new().unwrap();

    assert_eq!(recall(dir.path()), PageTone::Printed);
    assert_eq!(recall(&dir.path().join("never-created")), PageTone::Printed);

    fs::write(dir.path().join(PAGE_TONE_FILE_NAME), "lavender\n").unwrap();
    assert_eq!(recall(dir.path()), PageTone::Printed);
}

#[test]
fn the_single_dark_tone_of_before_reads_as_dusk() {
    let dir = TempDir::new().unwrap();

    fs::write(dir.path().join(PAGE_TONE_FILE_NAME), "dark\n").unwrap();
    assert_eq!(recall(dir.path()), PageTone::Dusk);
}

#[test]
fn the_stored_word_is_what_the_window_sends() {
    assert_eq!(serde_json::to_string(&PageTone::Dusk).unwrap(), "\"dusk\"");
    assert_eq!(
        serde_json::from_str::<PageTone>("\"printed\"").unwrap(),
        PageTone::Printed
    );
    assert!(serde_json::from_str::<PageTone>("\"lavender\"").is_err());
}
