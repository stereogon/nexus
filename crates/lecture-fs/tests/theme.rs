//! The theme preference, round-tripped through a real file.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::fs;

use lecture_core::Theme;
use lecture_fs::theme::{THEME_FILE_NAME, recall, remember};
use tempfile::TempDir;

#[test]
fn a_recorded_theme_comes_back() {
    let dir = TempDir::new().unwrap();
    let base = dir.path().join("Application Support").join("Nexus");

    for theme in [Theme::Light, Theme::Dark, Theme::System] {
        remember(&base, theme).unwrap();

        assert_eq!(recall(&base), theme);
    }
}

#[test]
fn the_folder_is_created_rather_than_assumed() {
    let dir = TempDir::new().unwrap();
    let base = dir.path().join("Application Support").join("Nexus");
    assert!(!base.exists());

    remember(&base, Theme::Dark).unwrap();

    assert!(base.is_dir());
    assert_eq!(recall(&base), Theme::Dark);
}

#[test]
fn nothing_recorded_follows_the_system() {
    let dir = TempDir::new().unwrap();

    assert_eq!(recall(dir.path()), Theme::System);
}

#[test]
fn a_missing_folder_follows_the_system_rather_than_failing() {
    let dir = TempDir::new().unwrap();

    assert_eq!(recall(&dir.path().join("never-created")), Theme::System);
}

#[test]
fn a_hand_edited_file_follows_the_system() {
    // The point of `recall` being infallible: a preference file nobody can parse is not a
    // reason to refuse to start. The value is reported to the log, not to the person.
    let dir = TempDir::new().unwrap();

    for junk in [
        "",
        "  ",
        "midnight",
        "DARK",
        "{\"theme\":\"dark\"}",
        "\u{0}",
    ] {
        fs::write(dir.path().join(THEME_FILE_NAME), junk).unwrap();

        assert_eq!(recall(dir.path()), Theme::System, "for {junk:?}");
    }
}

#[test]
fn the_newest_choice_wins() {
    let dir = TempDir::new().unwrap();

    remember(dir.path(), Theme::Dark).unwrap();
    remember(dir.path(), Theme::Light).unwrap();

    assert_eq!(recall(dir.path()), Theme::Light);
}

#[test]
fn it_is_one_readable_line() {
    // Somebody opening this file in a text editor should see a word, not a blob.
    let dir = TempDir::new().unwrap();
    remember(dir.path(), Theme::Dark).unwrap();

    let written = fs::read_to_string(dir.path().join(THEME_FILE_NAME)).unwrap();

    assert_eq!(written, "dark\n");
}

#[test]
fn choosing_the_system_theme_is_recorded_rather_than_cleared() {
    // "Follow the system" is a choice, not the absence of one. Someone who pins dark and
    // then goes back to system must get the system theme next launch, not dark again.
    let dir = TempDir::new().unwrap();

    remember(dir.path(), Theme::Dark).unwrap();
    remember(dir.path(), Theme::System).unwrap();

    assert_eq!(recall(dir.path()), Theme::System);
    assert!(dir.path().join(THEME_FILE_NAME).exists());
}
