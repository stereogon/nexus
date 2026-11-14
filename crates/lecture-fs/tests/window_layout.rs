//! The window-layout preference, round-tripped through real files.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::fs;

use lecture_fs::window_layout::{LAYOUT_FILE_NAME, WindowLayout, recall, remember};
use tempfile::TempDir;

#[test]
fn a_recorded_layout_comes_back() {
    let dir = TempDir::new().unwrap();
    let base = dir.path().join("Application Support").join("Nexus");

    remember(&base, WindowLayout::Islands).unwrap();
    assert_eq!(recall(&base), WindowLayout::Islands);

    remember(&base, WindowLayout::Classic).unwrap();
    assert_eq!(recall(&base), WindowLayout::Classic);
}

#[test]
fn nothing_recorded_or_unreadable_means_classic() {
    let dir = TempDir::new().unwrap();

    assert_eq!(recall(dir.path()), WindowLayout::Classic);
    assert_eq!(
        recall(&dir.path().join("never-created")),
        WindowLayout::Classic
    );

    fs::write(dir.path().join(LAYOUT_FILE_NAME), "floating\n").unwrap();
    assert_eq!(recall(dir.path()), WindowLayout::Classic);
}

#[test]
fn the_stored_word_is_what_the_window_sends() {
    assert_eq!(
        serde_json::to_string(&WindowLayout::Islands).unwrap(),
        "\"islands\""
    );
    assert_eq!(
        serde_json::from_str::<WindowLayout>("\"classic\"").unwrap(),
        WindowLayout::Classic
    );
    assert!(serde_json::from_str::<WindowLayout>("\"floating\"").is_err());
}
