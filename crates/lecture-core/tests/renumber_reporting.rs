//! Contract tests for what a renumber plan reports rather than silently does.
//!
//! Three things matter here. A name held by something that is not part of the renumber is
//! never written over — `fs::rename` replaces an existing file silently on POSIX, so this
//! is a data-loss path, not a tidiness one. A folder left out does not stop the rest
//! being numbered. And the plan says where each folder ended up, because anything keyed
//! by a lecture's path has to move with it.
//!
//! The ordering guarantee itself lives in `renumber.rs`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{
    DirectoryEntry, OrderKey, OrderedFolder, RenumberBlock, Slug, plan_renumber, stem_of,
};

fn slug(raw: &str) -> Slug {
    Slug::parse(raw).unwrap()
}

/// `folders` as `(name, sequence)`, in the order the keys sort.
fn folders(entries: &[(&str, &str)]) -> Vec<OrderedFolder> {
    entries
        .iter()
        .map(|(name, sequence)| OrderedFolder::new(slug(name), OrderKey::parse(sequence).unwrap()))
        .collect()
}

fn directories(names: &[&str]) -> Vec<DirectoryEntry> {
    names
        .iter()
        .map(|n| DirectoryEntry::directory(*n))
        .collect()
}

/// `fs::rename` replaces an existing file silently, so this one really matters.
#[test]
fn refuses_to_rename_over_something_that_is_not_part_of_the_renumber() {
    // A stray folder already holds the name `02-raft` needs.
    let plan = plan_renumber(
        &folders(&[("01-intro", "a0"), ("raft", "a1")]),
        &directories(&["01-intro", "raft", "02-raft"]),
    )
    .unwrap();

    assert!(
        plan.is_empty(),
        "nothing should be renamed: {:?}",
        plan.renames()
    );
    assert_eq!(plan.blocked().len(), 1);
    let blocked = plan.blocked().first().unwrap();
    assert_eq!(blocked.name.as_str(), "raft");
    assert_eq!(blocked.reason, RenumberBlock::NameTaken);
    assert!(blocked.reason.remediation().contains("Nothing was changed"));
}

#[test]
fn a_blocked_folder_does_not_stop_the_others_being_numbered() {
    let plan = plan_renumber(
        &folders(&[("a", "a0"), ("b", "a1"), ("c", "a2")]),
        &directories(&["a", "b", "c", "02-b"]),
    )
    .unwrap();

    // One folder cannot be placed; the rest must still be.
    let targets: Vec<&str> = plan.renames().iter().map(|r| r.to.as_str()).collect();

    assert!(
        targets.contains(&"01-a"),
        "the others must still be numbered: {targets:?}"
    );
    assert!(targets.contains(&"03-c"));
    assert_eq!(plan.blocked().len(), 1);
    assert_eq!(plan.blocked().first().unwrap().name.as_str(), "b");
}

#[test]
fn reports_where_each_folder_ended_up_so_a_caller_can_follow_it() {
    // Per-device view state is keyed by path, so a renumber that renames folders has to
    // say where they went or someone loses their place in every lecture.
    let plan = plan_renumber(
        &folders(&[("01-intro", "a1"), ("02-raft", "a2"), ("03-paxos", "a0")]),
        &directories(&["01-intro", "02-raft", "03-paxos"]),
    )
    .unwrap();

    let mut moves: Vec<(String, String)> = plan
        .net_moves()
        .into_iter()
        .map(|(from, to)| (from.as_str().to_owned(), to.as_str().to_owned()))
        .collect();
    moves.sort();

    assert_eq!(
        moves,
        [
            ("01-intro".to_owned(), "02-intro".to_owned()),
            ("02-raft".to_owned(), "03-raft".to_owned()),
            ("03-paxos".to_owned(), "01-paxos".to_owned()),
        ],
        "temporary names must not leak into the reported moves"
    );
}

#[test]
fn reads_a_prefix_off_a_name_without_mistaking_other_things_for_one() {
    assert_eq!(stem_of("01-raft"), "raft");
    assert_eq!(stem_of("1-raft"), "raft");
    assert_eq!(stem_of("007-raft"), "raft");
    assert_eq!(stem_of("raft"), "raft");
    assert_eq!(stem_of("v2-raft"), "v2-raft", "not a position");
    assert_eq!(stem_of("-raft"), "-raft", "no digits is not a prefix");
    assert_eq!(
        stem_of("2026-raft"),
        "raft",
        "a year-like prefix is still a prefix"
    );
}

#[test]
fn produces_the_same_plan_twice_for_the_same_vault() {
    // Two lectures sharing a sequence is a conflict to resolve elsewhere; here it only
    // needs to not produce a different plan each run.
    let shape = &[("b", "a0"), ("a", "a0")];
    let names = ["b", "a"];

    let first = plan_renumber(&folders(shape), &directories(&names)).unwrap();
    let second = plan_renumber(&folders(shape), &directories(&names)).unwrap();

    assert_eq!(first, second);
}
