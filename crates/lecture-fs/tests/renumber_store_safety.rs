//! Contract tests for what renumbering must never do to someone's files.
//!
//! Four guarantees. It never writes over something it does not own — POSIX `rename`
//! replaces a file silently, so this is a data-loss path rather than a tidiness one. It
//! never touches a `manifest.json`, because `sequence` is the real order and this only
//! repaints it. Stopping half-way leaves a vault that re-running finishes. And it reports
//! where each lecture went, so a reading position can follow its folder instead of being
//! quietly lost.
//!
//! The numbering itself lives in `renumber_store.rs`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod support;

use std::fs;

use lecture_core::{LectureView, PageNumber, ViewState};

use tempfile::TempDir;

use support::{manifests, names_in, path, renumber, write_lecture};

/// `sequence` is the order; renumbering only repaints it.
#[test]
fn never_writes_to_a_manifest() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/01-intro", "Intro", "a1");
    write_lecture(dir.path(), "cs454/02-raft", "Raft", "a0");

    let before = fs::read(dir.path().join("cs454/02-raft/manifest.json")).unwrap();

    let renumber = renumber(dir.path());
    let parent = path("cs454");
    let plan = renumber.plan(Some(&parent)).unwrap();
    renumber.apply(Some(&parent), &plan).unwrap();

    let after = fs::read(dir.path().join("cs454/01-raft/manifest.json")).unwrap();
    assert_eq!(before, after, "the manifest must travel unchanged");
}

/// POSIX rename replaces a file silently, so this is a data-loss path.
#[test]
fn refuses_to_rename_over_a_file_someone_left_there() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/intro", "Intro", "a0");

    // Exactly the name `intro` needs, holding something that is not ours.
    let occupied = dir.path().join("cs454/01-intro");
    fs::write(&occupied, b"someone's notes\n").unwrap();

    let renumber = renumber(dir.path());
    let parent = path("cs454");
    let plan = renumber.plan(Some(&parent)).unwrap();

    assert!(plan.is_empty(), "the planner should refuse it outright");
    assert_eq!(plan.blocked().len(), 1);
    assert_eq!(
        fs::read_to_string(&occupied).unwrap(),
        "someone's notes\n",
        "the file must be untouched"
    );
}

/// Even if the plan was computed before the name was taken.
#[test]
fn the_rename_itself_refuses_an_occupied_destination() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/intro", "Intro", "a0");

    let renumber = renumber(dir.path());
    let parent = path("cs454");
    let plan = renumber.plan(Some(&parent)).unwrap();
    assert_eq!(plan.len(), 1);

    // Something appears at the destination between planning and applying.
    let occupied = dir.path().join("cs454/01-intro");
    fs::write(&occupied, b"appeared late\n").unwrap();

    let outcome = renumber.apply(Some(&parent), &plan).unwrap();

    assert!(!outcome.is_complete(), "it must stop rather than overwrite");
    assert_eq!(
        outcome.stopped_by.as_ref().unwrap().code(),
        "ERR_NAME_ALREADY_TAKEN"
    );
    assert_eq!(
        fs::read_to_string(&occupied).unwrap(),
        "appeared late\n",
        "the late arrival must survive"
    );
    assert!(
        dir.path().join("cs454/intro").is_dir(),
        "and the lecture must still be where it was"
    );
}

/// A half-finished renumber is recoverable, which is why stopping is safe.
#[test]
fn re_running_finishes_a_renumber_that_stopped_part_way() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/01-lecture", "Second", "a1");
    write_lecture(dir.path(), "cs454/02-lecture", "First", "a0");

    let renumber = renumber(dir.path());
    let parent = path("cs454");

    // Apply only the first rename of the plan, as if the app had died after it.
    let plan = renumber.plan(Some(&parent)).unwrap();
    let first = plan.renames().first().unwrap();
    manifests(dir.path())
        .storage()
        .rename(
            &parent.child(first.from.clone()).unwrap(),
            &parent.child(first.to.clone()).unwrap(),
        )
        .unwrap();

    // The order the app shows is still correct, because sequence was never touched.
    let replanned = renumber.plan(Some(&parent)).unwrap();
    let outcome = renumber.apply(Some(&parent), &replanned).unwrap();

    assert!(outcome.is_complete());
    assert_eq!(names_in(dir.path(), "cs454"), ["01-lecture", "02-lecture"]);
    assert_eq!(
        manifests(dir.path())
            .load(&path("cs454/01-lecture"))
            .unwrap()
            .title()
            .as_str(),
        "First"
    );
}

/// Otherwise tidying folder names silently costs you your place in every one.
#[test]
fn reports_moves_so_a_reading_position_can_follow_its_lecture() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/01-intro", "Intro", "a1");
    write_lecture(dir.path(), "cs454/02-raft", "Raft", "a0");

    let mut state = ViewState::empty();
    state.remember(
        &path("cs454/02-raft"),
        LectureView::at_page(PageNumber::new(40).unwrap()),
    );

    let renumber = renumber(dir.path());
    let parent = path("cs454");
    let plan = renumber.plan(Some(&parent)).unwrap();
    let outcome = renumber.apply(Some(&parent), &plan).unwrap();

    for (from, to) in &outcome.moved {
        state.relocate(from, to);
    }

    assert_eq!(
        state
            .position_in(&path("cs454/01-raft"))
            .expect("the position should have followed the folder")
            .page()
            .get(),
        40
    );
    assert!(state.position_in(&path("cs454/02-raft")).is_none());
    assert_eq!(state.last_opened(), Some(&path("cs454/01-raft")));
}
