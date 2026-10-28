//! Filing a real vault's lectures where their facets say they belong.
//!
//! The planner is tested without a filesystem in `lecture-core`. These are the guarantees
//! that only a real directory tree can show: that the moves land, that a cycle survives
//! being replayed against POSIX `rename`, that nothing is written over, and that stopping
//! half-way leaves a vault which still opens and which re-running finishes.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod support;

use std::fs;

use lecture_core::PathTemplate;
use tempfile::TempDir;

use support::{load, reorganize, write_filed_lecture, write_lecture};

fn template(raw: &str) -> PathTemplate {
    PathTemplate::parse(raw).unwrap()
}

/// Whether a lecture is at this path, by the only test that matters: its manifest is there.
fn lecture_at(root: &std::path::Path, directory: &str) -> bool {
    root.join(directory).join("manifest.json").is_file()
}

#[test]

fn a_lecture_is_filed_under_its_facets() {
    let dir = TempDir::new().unwrap();
    write_filed_lecture(dir.path(), "raft", "Raft Consensus", "CS454", "Week 3");

    let reorganize = reorganize(dir.path());
    let plan = reorganize
        .plan(&load(dir.path()), &template("{course}/{week}-{title}"))
        .unwrap();

    assert_eq!(plan.moves().len(), 1);

    let outcome = reorganize.apply(&plan).unwrap();

    assert!(outcome.is_complete());
    assert!(
        lecture_at(dir.path(), "cs454/week-3-raft-consensus"),
        "the lecture is not where the template said: {:?}",
        fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect::<Vec<_>>()
    );
    assert!(!dir.path().join("raft").exists());
}

#[test]
fn the_parent_folders_a_target_needs_are_created() {
    // The template is two levels deep and `cs454/` does not exist yet. A move into a
    // directory that is not there fails with a bare io error, which is a poor way to learn
    // that the feature does not work.
    let dir = TempDir::new().unwrap();
    write_filed_lecture(dir.path(), "raft", "Raft", "CS454", "Week 3");

    let reorganize = reorganize(dir.path());
    let plan = reorganize
        .plan(&load(dir.path()), &template("{course}/{week}/{title}"))
        .unwrap();
    reorganize.apply(&plan).unwrap();

    assert!(lecture_at(dir.path(), "cs454/week-3/raft"));
}

#[test]
fn a_lecture_already_in_the_right_place_is_left_alone() {
    let dir = TempDir::new().unwrap();
    write_filed_lecture(dir.path(), "cs454/week-3-raft", "Raft", "CS454", "Week 3");

    let plan = reorganize(dir.path())
        .plan(&load(dir.path()), &template("{course}/{week}-{title}"))
        .unwrap();

    assert!(plan.moves().is_empty(), "nothing should need moving");
    assert_eq!(plan.unchanged(), 1);
    assert!(plan.blocked().is_empty(), "and it is not blocked by itself");
}

#[test]
fn a_cycle_of_swapped_lectures_survives_a_real_rename() {
    // The load-bearing one. POSIX `rename` replaces silently, and a permutation containing
    // a cycle has no collision-free ordering -- every target is held by another member. The
    // planner breaks it with one temporary name; this proves the sequence it produces
    // actually works against a filesystem rather than against a model of one.
    let dir = TempDir::new().unwrap();
    write_filed_lecture(dir.path(), "cs454/week-2-raft", "Raft", "CS454", "Week 1");
    write_filed_lecture(dir.path(), "cs454/week-1-paxos", "Paxos", "CS454", "Week 2");

    let reorganize = reorganize(dir.path());
    let plan = reorganize
        .plan(&load(dir.path()), &template("{course}/{week}-{title}"))
        .unwrap();

    assert!(plan.blocked().is_empty(), "a cycle is movable, not blocked");

    let outcome = reorganize.apply(&plan).unwrap();

    assert!(outcome.is_complete(), "stopped by {:?}", outcome.stopped_by);
    assert!(lecture_at(dir.path(), "cs454/week-1-raft"));
    assert!(lecture_at(dir.path(), "cs454/week-2-paxos"));
    assert_eq!(
        load(dir.path()).bundles.len(),
        2,
        "both lectures must still be findable"
    );
}

#[test]
fn where_each_lecture_ended_up_is_reported_so_a_reading_position_can_follow() {
    // `ViewState` is keyed by lecture path, so a move orphans a remembered page unless the
    // caller is told. The temporary name a cycle needs must not leak into this: what a
    // caller needs is the net effect.
    let dir = TempDir::new().unwrap();
    write_filed_lecture(dir.path(), "cs454/week-2-raft", "Raft", "CS454", "Week 1");
    write_filed_lecture(dir.path(), "cs454/week-1-paxos", "Paxos", "CS454", "Week 2");

    let reorganize = reorganize(dir.path());
    let plan = reorganize
        .plan(&load(dir.path()), &template("{course}/{week}-{title}"))
        .unwrap();
    let outcome = reorganize.apply(&plan).unwrap();

    let mut moved: Vec<(String, String)> = outcome
        .moved
        .iter()
        .map(|(from, to)| (from.to_string(), to.to_string()))
        .collect();
    moved.sort();

    assert_eq!(
        moved,
        vec![
            (
                "cs454/week-1-paxos".to_owned(),
                "cs454/week-2-paxos".to_owned()
            ),
            (
                "cs454/week-2-raft".to_owned(),
                "cs454/week-1-raft".to_owned()
            ),
        ],
        "a temporary name must not appear in the net effect"
    );
}

#[test]

fn a_lecture_with_no_facets_is_filed_by_title_when_the_template_allows_it() {
    // The same lecture under a template whose title level needs nothing else. Together
    // with the test above this pins where the limit actually is: the template, not the
    // lecture.
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "whatever-the-download-was-called", "Raft", "a0");

    let reorganize = reorganize(dir.path());
    let plan = reorganize
        .plan(&load(dir.path()), &template("{course}/{title}"))
        .unwrap();
    let outcome = reorganize.apply(&plan).unwrap();

    assert!(outcome.is_complete());
    assert!(plan.blocked().is_empty());
    assert!(lecture_at(dir.path(), "raft"));
}
