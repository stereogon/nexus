//! Contract tests for renumbering a real vault's folders: the numbering itself.
//!
//! The ordering guarantee is proved without a filesystem in `lecture-core`. These check
//! that it reaches the disk correctly — including the shared-stem swap, which is the case
//! that actually needs a temporary name on a real volume.
//!
//! What protects someone's files while this happens lives in
//! `renumber_store_safety.rs`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod support;

use std::fs;

use tempfile::TempDir;

use support::{manifests, names_in, path, renumber, write_lecture};

#[test]
fn numbers_an_unnumbered_folder_of_lectures() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/intro", "Intro", "a0");
    write_lecture(dir.path(), "cs454/raft", "Raft", "a1");
    write_lecture(dir.path(), "cs454/paxos", "Paxos", "a2");

    let renumber = renumber(dir.path());
    let parent = path("cs454");
    let plan = renumber.plan(Some(&parent)).unwrap();
    let outcome = renumber.apply(Some(&parent), &plan).unwrap();

    assert!(outcome.is_complete());
    assert_eq!(
        names_in(dir.path(), "cs454"),
        ["01-intro", "02-raft", "03-paxos"]
    );
}

#[test]
fn reorders_to_match_sequence_rather_than_the_existing_prefixes() {
    let dir = TempDir::new().unwrap();
    // The prefixes say intro, raft, paxos. `sequence` says paxos first.
    write_lecture(dir.path(), "cs454/01-intro", "Intro", "a1");
    write_lecture(dir.path(), "cs454/02-raft", "Raft", "a2");
    write_lecture(dir.path(), "cs454/03-paxos", "Paxos", "a0");

    let renumber = renumber(dir.path());
    let parent = path("cs454");
    let plan = renumber.plan(Some(&parent)).unwrap();
    renumber.apply(Some(&parent), &plan).unwrap();

    assert_eq!(
        names_in(dir.path(), "cs454"),
        ["01-paxos", "02-intro", "03-raft"],
        "sequence wins over the prefix"
    );
}

/// The case that needs a temporary name on a real filesystem.
#[test]
fn swaps_two_folders_that_share_a_stem() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/01-lecture", "Second", "a1");
    write_lecture(dir.path(), "cs454/02-lecture", "First", "a0");

    let renumber = renumber(dir.path());
    let parent = path("cs454");
    let plan = renumber.plan(Some(&parent)).unwrap();
    let outcome = renumber.apply(Some(&parent), &plan).unwrap();

    assert!(outcome.is_complete());
    assert_eq!(
        names_in(dir.path(), "cs454"),
        ["01-lecture", "02-lecture"],
        "no temporary name may survive"
    );
    assert_eq!(
        manifests(dir.path())
            .load(&path("cs454/01-lecture"))
            .unwrap()
            .title()
            .as_str(),
        "First",
        "the folders really did swap contents"
    );
}

#[test]
fn a_vault_already_in_order_is_left_completely_alone() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/01-intro", "Intro", "a0");
    write_lecture(dir.path(), "cs454/02-raft", "Raft", "a1");

    let renumber = renumber(dir.path());
    let parent = path("cs454");
    let plan = renumber.plan(Some(&parent)).unwrap();

    assert!(plan.is_empty());
    let outcome = renumber.apply(Some(&parent), &plan).unwrap();
    assert_eq!(outcome.renames_applied, 0);
    assert!(outcome.moved.is_empty());
}

#[test]
fn renumbers_the_vault_root_too() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "intro", "Intro", "a1");
    write_lecture(dir.path(), "raft", "Raft", "a0");

    let renumber = renumber(dir.path());
    let plan = renumber.plan(None).unwrap();
    renumber.apply(None, &plan).unwrap();

    assert_eq!(names_in(dir.path(), ""), ["01-raft", "02-intro"]);
}

#[test]
fn ignores_folders_that_are_not_lectures() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/intro", "Intro", "a0");
    fs::create_dir_all(dir.path().join("cs454/scratch")).unwrap();
    fs::write(dir.path().join("cs454/syllabus.pdf"), b"%PDF-1.7\n").unwrap();

    let renumber = renumber(dir.path());
    let parent = path("cs454");
    let plan = renumber.plan(Some(&parent)).unwrap();
    renumber.apply(Some(&parent), &plan).unwrap();

    assert_eq!(
        names_in(dir.path(), "cs454"),
        ["01-intro", "scratch", "syllabus.pdf"],
        "only lectures are numbered, and nothing else is disturbed"
    );
}

#[test]
fn only_numbers_direct_children_because_a_prefix_orders_siblings() {
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "cs454/week-01/intro", "Intro", "a0");
    write_lecture(dir.path(), "cs454/week-01/raft", "Raft", "a1");

    let renumber = renumber(dir.path());
    let parent = path("cs454");
    let plan = renumber.plan(Some(&parent)).unwrap();

    assert!(
        plan.is_empty(),
        "week-01 holds no manifest, so it is not a lecture to number: {:?}",
        plan.renames()
    );

    let nested = path("cs454/week-01");
    let inner = renumber.plan(Some(&nested)).unwrap();
    renumber.apply(Some(&nested), &inner).unwrap();

    assert_eq!(
        names_in(dir.path(), "cs454/week-01"),
        ["01-intro", "02-raft"]
    );
}
