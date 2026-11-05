//! The notes-width preference, round-tripped through a real file.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::fs;

use lecture_fs::notes_width::{
    MAX_NOTES_WIDTH, MIN_NOTES_WIDTH, NOTES_WIDTH_FILE_NAME, recall, remember,
};
use tempfile::TempDir;

#[test]
fn a_recorded_width_comes_back() {
    let dir = TempDir::new().unwrap();
    let base = dir.path().join("Application Support").join("Nexus");

    remember(&base, 520).unwrap();

    assert_eq!(recall(&base), Some(520));
}

#[test]
fn nothing_recorded_means_the_default() {
    let dir = TempDir::new().unwrap();

    assert_eq!(recall(dir.path()), None);
    assert_eq!(recall(&dir.path().join("never-created")), None);
}

#[test]
fn the_newest_choice_wins() {
    let dir = TempDir::new().unwrap();

    remember(dir.path(), 400).unwrap();
    remember(dir.path(), 610).unwrap();

    assert_eq!(recall(dir.path()), Some(610));
}

#[test]
fn it_is_one_readable_line() {
    let dir = TempDir::new().unwrap();
    remember(dir.path(), 480).unwrap();

    assert_eq!(
        fs::read_to_string(dir.path().join(NOTES_WIDTH_FILE_NAME)).unwrap(),
        "480\n"
    );
}

#[test]
fn a_width_outside_the_range_is_kept_at_its_nearest_end() {
    let dir = TempDir::new().unwrap();

    remember(dir.path(), 3).unwrap();
    assert_eq!(recall(dir.path()), Some(MIN_NOTES_WIDTH));

    remember(dir.path(), u32::MAX).unwrap();
    assert_eq!(recall(dir.path()), Some(MAX_NOTES_WIDTH));
}

#[test]
fn a_hand_edited_file_means_the_default() {
    let dir = TempDir::new().unwrap();

    for junk in [
        "", " ", "wide", "-400", "400px", "4.5", "99999", "100", "\u{0}",
    ] {
        fs::write(dir.path().join(NOTES_WIDTH_FILE_NAME), junk).unwrap();

        assert_eq!(recall(dir.path()), None, "for {junk:?}");
    }
}
