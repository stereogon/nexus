//! What a reorganize refuses to do, and what it says instead.
//!
//! Every case here ends with a lecture still where it was and a reason a person can act
//! on. Split from `reorganize.rs`, which covers the moves and the order they happen in.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use lecture_core::{PlacedLecture, RelativePath, ReorganizeBlock, Unnameable, plan_reorganize};

fn at(path: &str) -> RelativePath {
    RelativePath::parse(path).unwrap()
}

fn placed(current: &str, target: &str) -> PlacedLecture {
    PlacedLecture::new(at(current), at(target))
}

#[test]
fn a_target_held_by_something_that_is_not_moving_is_reported_not_overwritten() {
    // `fs::rename` replaces silently on POSIX, so this is the difference between a tidy-up
    // and losing a folder.
    let plan = plan_reorganize(
        &[placed("inbox/raft", "cs-454/notes")],
        &[],
        &[at("cs-454/notes")],
    );

    assert!(plan.moves().is_empty());
    assert_eq!(plan.blocked().len(), 1);
    assert_eq!(plan.blocked()[0].at, at("inbox/raft"));
    assert_eq!(plan.blocked()[0].reason, ReorganizeBlock::TargetOccupied);
    assert!(
        plan.blocked()[0]
            .reason
            .remediation()
            .contains("Move or rename")
    );
}

#[test]
fn a_collision_with_an_already_placed_lecture_names_both_lectures() {
    // Written expecting the mover to be blocked as `TargetOccupied` while the lecture
    // already in place counted as unchanged. The planner reports **both** as
    // `SharedTarget` instead, and that is the better answer: the problem is not that a
    // folder happens to be busy, it is that two lectures render to one name and a person
    // has to rename one of them. `TargetOccupied` would have pointed at the folder and sent
    // them looking for something that is not a lecture.
    let plan = plan_reorganize(
        &[
            placed("cs-454/raft", "cs-454/raft"),
            placed("inbox/raft", "cs-454/raft"),
        ],
        &[],
        &[],
    );

    assert!(plan.moves().is_empty());
    assert_eq!(plan.blocked().len(), 2, "both lectures need naming");
    for blocked in plan.blocked() {
        assert_eq!(blocked.reason, ReorganizeBlock::SharedTarget);
        assert!(blocked.reason.remediation().contains("Rename one"));
    }
    assert_eq!(
        plan.unchanged(),
        0,
        "the one already in place is part of the conflict, not settled"
    );
}

#[test]
fn two_lectures_rendering_to_one_folder_are_both_reported() {
    // The `Raft` / `raft` collision recorded when `PathTemplate` landed. Neither wins: one
    // winning silently would file a lecture on top of another.
    let plan = plan_reorganize(
        &[
            placed("inbox/one", "cs-454/raft"),
            placed("inbox/two", "cs-454/raft"),
        ],
        &[],
        &[],
    );

    assert!(plan.moves().is_empty());
    assert_eq!(plan.blocked().len(), 2);
    for blocked in plan.blocked() {
        assert_eq!(blocked.reason, ReorganizeBlock::SharedTarget);
    }
}

#[test]
fn a_shared_target_does_not_stop_the_rest_of_the_plan() {
    // A preview is worth little if one bad lecture discards the other ninety-nine.
    let plan = plan_reorganize(
        &[
            placed("inbox/one", "cs-454/raft"),
            placed("inbox/two", "cs-454/raft"),
            placed("inbox/three", "cs-454/paxos"),
        ],
        &[],
        &[],
    );

    assert_eq!(plan.moves().len(), 1);
    assert_eq!(plan.moves()[0].to, at("cs-454/paxos"));
    assert_eq!(plan.blocked().len(), 2);
}

#[test]

fn a_lecture_with_no_usable_name_is_reported_rather_than_counted_as_unchanged() {
    // `NameUnusable` was declared with a remediation and never constructed: a variant that
    // read as handled but could not occur. Its producer is the caller that renders the
    // template, which is why it only became reachable when the adapter started doing that.
    let plan = plan_reorganize(
        &[],
        &[(at("whatever-it-was-called"), Unnameable::TextUnusable)],
        &[],
    );

    assert!(plan.moves().is_empty());
    assert_eq!(plan.unchanged(), 0, "it is blocked, not unchanged");
    assert_eq!(plan.blocked().len(), 1);
    assert_eq!(plan.blocked()[0].at, at("whatever-it-was-called"));
    assert_eq!(plan.blocked()[0].reason, ReorganizeBlock::NameUnusable);
    assert_eq!(
        plan.blocked()[0].wanted,
        None,
        "there is nowhere it wanted to be, and an empty string would be a worse answer"
    );
}

#[test]
fn the_two_ways_a_pattern_can_fail_to_name_a_lecture_are_reported_differently() {
    // The whole point of carrying the reason. These two want opposite things done about
    // them -- add a facet, or fix a name -- and they used to arrive as the same sentence,
    // which told the common case to go and fix a title that was never the problem.
    let plan = plan_reorganize(
        &[],
        &[
            (at("needs-a-week"), Unnameable::FacetsMissing),
            (at("all-punctuation"), Unnameable::TextUnusable),
        ],
        &[],
    );

    assert_eq!(plan.blocked().len(), 2);

    let needs_facets = plan
        .blocked()
        .iter()
        .find(|blocked| blocked.at == at("needs-a-week"))
        .expect("the lecture with no week should be blocked");
    let bad_name = plan
        .blocked()
        .iter()
        .find(|blocked| blocked.at == at("all-punctuation"))
        .expect("the lecture with an unusable name should be blocked");

    assert_eq!(needs_facets.reason, ReorganizeBlock::PatternNeedsFacets);
    assert_eq!(bad_name.reason, ReorganizeBlock::NameUnusable);

    // And the sentences differ, which is the part a person actually reads.
    assert_ne!(
        needs_facets.reason.remediation(),
        bad_name.reason.remediation()
    );
    assert!(
        needs_facets.reason.remediation().contains("facets"),
        "the advice for a missing facet should mention facets, not the title"
    );
}

#[test]
fn an_unnameable_lecture_still_holds_the_folder_it_is_sitting_in() {
    // It is staying, so it is an obstacle like any other. Leaving it out of the occupied
    // set would let another lecture be planned straight onto it -- and `rename` refusing at
    // apply time is a poor substitute for a preview that already knew.
    let plan = plan_reorganize(
        &[placed("raft", "intro")],
        &[(at("intro"), Unnameable::FacetsMissing)],
        &[],
    );

    assert!(plan.moves().is_empty(), "the target is taken by a stayer");
    assert_eq!(plan.blocked().len(), 2, "the mover and the unnameable one");
    assert!(
        plan.blocked()
            .iter()
            .any(|b| b.at == at("raft") && b.reason == ReorganizeBlock::TargetOccupied),
        "the mover must be told the folder is held: {:?}",
        plan.blocked()
    );
}
