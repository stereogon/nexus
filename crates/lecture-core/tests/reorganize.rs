//! What a reorganize would do, and what it reports instead of doing.

// Indexing is allowed here alongside the usual test overrides sanctioned in `Cargo.toml`:
// these assertions are about a plan's *order*, so `moves()[1]` says what it means, and it
// can panic no more readily than the `unwrap`s already permitted above it.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use lecture_core::{Facets, Label, PathTemplate, PlacedLecture, RelativePath, plan_reorganize};

fn at(path: &str) -> RelativePath {
    RelativePath::parse(path).unwrap()
}

fn placed(current: &str, target: &str) -> PlacedLecture {
    PlacedLecture::new(at(current), at(target))
}

#[test]
fn a_lecture_already_where_it_belongs_is_left_alone() {
    let plan = plan_reorganize(&[placed("cs-454/raft", "cs-454/raft")], &[], &[]);

    assert!(plan.is_empty());
    assert_eq!(plan.unchanged(), 1);
    assert!(plan.blocked().is_empty());
}

#[test]
fn a_lecture_in_the_wrong_place_is_moved() {
    let plan = plan_reorganize(&[placed("inbox/raft", "cs-454/week-3-raft")], &[], &[]);

    assert_eq!(plan.moves().len(), 1);
    assert_eq!(plan.moves()[0].from, at("inbox/raft"));
    assert_eq!(plan.moves()[0].to, at("cs-454/week-3-raft"));
    assert_eq!(plan.unchanged(), 0);
}

#[test]
fn moves_are_ordered_so_each_target_is_free_when_its_turn_comes() {
    // A chain: raft wants paxos's folder, and paxos is moving out of it. Done in the wrong
    // order the first move would land on an occupied name.
    let plan = plan_reorganize(
        &[
            placed("cs-454/02-raft", "cs-454/01-raft"),
            placed("cs-454/01-raft", "cs-454/00-paxos"),
        ],
        &[],
        &[],
    );

    assert!(plan.blocked().is_empty());
    assert_eq!(plan.moves().len(), 2);
    assert_eq!(
        plan.moves()[0].from,
        at("cs-454/01-raft"),
        "the folder whose target is already free must go first"
    );
    assert_eq!(plan.moves()[1].from, at("cs-454/02-raft"));
}

#[test]
fn two_lectures_that_have_swapped_places_are_a_cycle_and_still_get_moved() {
    // No ordering resolves this -- each target is held by the other -- so one folder is
    // parked under a temporary name. This is why the plan is a sequence and not a set.
    let plan = plan_reorganize(
        &[
            placed("cs-454/raft", "cs-454/paxos"),
            placed("cs-454/paxos", "cs-454/raft"),
        ],
        &[],
        &[],
    );

    assert!(
        plan.blocked().is_empty(),
        "a cycle is breakable, not blocked"
    );
    assert_eq!(
        plan.moves().len(),
        3,
        "two swaps need three renames: aside, across, back"
    );

    // The mechanics include a folder nobody asked for; the preview should not.
    let net = plan.net_moves();
    assert_eq!(net.len(), 2);
    assert!(net.contains(&(at("cs-454/raft"), at("cs-454/paxos"))));
    assert!(net.contains(&(at("cs-454/paxos"), at("cs-454/raft"))));
}

#[test]
fn every_step_of_a_cycle_lands_somewhere_free() {
    // Replays the plan against a model of the vault. If any step moved onto an occupied
    // name, `fs::rename` would silently destroy whatever was there.
    let plan = plan_reorganize(
        &[
            placed("c/a", "c/b"),
            placed("c/b", "c/d"),
            placed("c/d", "c/a"),
        ],
        &[],
        &[at("c/keep")],
    );

    let mut present: Vec<String> = ["c/a", "c/b", "c/d", "c/keep"]
        .iter()
        .map(ToString::to_string)
        .collect();

    for step in plan.moves() {
        let to = step.to.to_string();
        assert!(
            !present.contains(&to),
            "step {} -> {to} lands on something that is still there",
            step.from
        );

        let from = step.from.to_string();
        present.retain(|held| held != &from);
        present.push(to);
    }

    present.sort();
    assert_eq!(present, vec!["c/a", "c/b", "c/d", "c/keep"]);
}

#[test]

fn an_empty_vault_plans_nothing_and_says_so() {
    let plan = plan_reorganize(&[], &[], &[]);

    assert!(plan.is_empty());
    assert_eq!(plan.unchanged(), 0);
    assert!(plan.blocked().is_empty());
    assert!(plan.net_moves().is_empty());
}

#[test]
fn planning_the_same_vault_twice_gives_the_same_plan() {
    // A preview someone is reading must not reshuffle itself between the preview and the
    // apply.
    let lectures = [
        placed("inbox/a", "cs-454/01-a"),
        placed("inbox/b", "cs-454/02-b"),
        placed("inbox/c", "cs-454/03-c"),
    ];

    assert_eq!(
        plan_reorganize(&lectures, &[], &[]),
        plan_reorganize(&lectures, &[], &[])
    );
}

#[test]
fn a_plan_run_twice_is_a_no_op_the_second_time() {
    // The property that makes an interrupted reorganize safe: re-running finishes the job
    // and changes nothing that is already done.
    let first = plan_reorganize(&[placed("inbox/raft", "cs-454/raft")], &[], &[]);
    assert_eq!(first.moves().len(), 1);

    let second = plan_reorganize(&[placed("cs-454/raft", "cs-454/raft")], &[], &[]);
    assert!(second.is_empty());
    assert_eq!(second.unchanged(), 1);
}

#[test]
fn a_template_and_a_plan_compose_into_the_whole_operation() {
    // The two halves together, which is how a caller uses them: render each lecture's
    // target from its facets, then plan the moves.
    let template = PathTemplate::parse("{course}/{week}-{title}").unwrap();
    let facets = Facets::empty()
        .with_course(Label::parse("CS 454").unwrap())
        .with_week(Label::parse("Week 3").unwrap());

    let target = template
        .render(&facets, &Label::parse("Raft and consensus").unwrap())
        .unwrap();
    let plan = plan_reorganize(
        &[PlacedLecture::new(at("inbox/download-7"), target)],
        &[],
        &[],
    );

    assert_eq!(plan.moves().len(), 1);
    assert_eq!(
        plan.moves()[0].to.to_string(),
        "cs-454/week-3-raft-and-consensus"
    );
}
