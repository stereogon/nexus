//! The pane-width preferences, round-tripped through real files.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::fs;

use lecture_fs::pane_width::{Pane, recall, remember};
use tempfile::TempDir;

#[test]
fn a_recorded_width_comes_back() {
    let dir = TempDir::new().unwrap();
    let base = dir.path().join("Application Support").join("Nexus");

    remember(&base, Pane::Notes, 520).unwrap();

    assert_eq!(recall(&base, Pane::Notes), Some(520));
}

#[test]
fn each_pane_keeps_its_own_width() {
    let dir = TempDir::new().unwrap();

    remember(dir.path(), Pane::Notes, 520).unwrap();
    remember(dir.path(), Pane::Sidebar, 300).unwrap();

    assert_eq!(recall(dir.path(), Pane::Notes), Some(520));
    assert_eq!(recall(dir.path(), Pane::Sidebar), Some(300));
}

#[test]
fn the_notes_width_is_still_found_where_it_was_kept() {
    // Written before the sidebar could be dragged, under the name the notes always had.
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("notes-width.txt"), "610\n").unwrap();

    assert_eq!(recall(dir.path(), Pane::Notes), Some(610));
    assert_eq!(recall(dir.path(), Pane::Sidebar), None);
}

#[test]
fn nothing_recorded_means_the_default() {
    let dir = TempDir::new().unwrap();

    assert_eq!(recall(dir.path(), Pane::Notes), None);
    assert_eq!(
        recall(&dir.path().join("never-created"), Pane::Sidebar),
        None
    );
}

#[test]
fn the_newest_choice_wins() {
    let dir = TempDir::new().unwrap();

    remember(dir.path(), Pane::Sidebar, 240).unwrap();
    remember(dir.path(), Pane::Sidebar, 330).unwrap();

    assert_eq!(recall(dir.path(), Pane::Sidebar), Some(330));
}

#[test]
fn it_is_one_readable_line() {
    let dir = TempDir::new().unwrap();
    remember(dir.path(), Pane::Sidebar, 280).unwrap();

    assert_eq!(
        fs::read_to_string(dir.path().join(Pane::Sidebar.file_name())).unwrap(),
        "280\n"
    );
}

#[test]
fn a_width_outside_the_range_is_kept_at_its_nearest_end() {
    let dir = TempDir::new().unwrap();

    for pane in [Pane::Notes, Pane::Sidebar] {
        let range = pane.plausible_widths();

        remember(dir.path(), pane, 3).unwrap();
        assert_eq!(recall(dir.path(), pane), Some(*range.start()));

        remember(dir.path(), pane, u32::MAX).unwrap();
        assert_eq!(recall(dir.path(), pane), Some(*range.end()));
    }
}

#[test]
fn a_hand_edited_file_means_the_default() {
    let dir = TempDir::new().unwrap();

    for junk in [
        "", " ", "wide", "-400", "400px", "4.5", "99999", "100", "\u{0}",
    ] {
        for pane in [Pane::Notes, Pane::Sidebar] {
            fs::write(dir.path().join(pane.file_name()), junk).unwrap();

            assert_eq!(recall(dir.path(), pane), None, "for {junk:?}");
        }
    }
}

#[test]
fn the_window_names_the_panes_in_lower_case() {
    assert_eq!(
        serde_json::from_str::<Pane>("\"notes\"").unwrap(),
        Pane::Notes
    );
    assert_eq!(
        serde_json::from_str::<Pane>("\"sidebar\"").unwrap(),
        Pane::Sidebar
    );
    assert!(serde_json::from_str::<Pane>("\"viewer\"").is_err());
}
