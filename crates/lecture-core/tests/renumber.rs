//! Contract tests for the ordering guarantee a renumber plan makes.
//!
//! The load-bearing piece is [`apply`] together with
//! `no_plan_ever_renames_onto_an_occupied_name`. Rather than asserting a particular
//! sequence of renames, it *simulates* applying the plan and fails if any rename would
//! land on a name that is taken. That is the property the plan exists to provide, and
//! the reason the old "tail-first" rule was replaced.
//!
//! What a plan reports, and how names are read and built, live in
//! `renumber_reporting.rs`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::collections::HashSet;

use lecture_core::{
    DirectoryEntry, OrderKey, OrderedFolder, RENUMBERING_SUFFIX, RenumberPlan, Slug, plan_renumber,
    position_width,
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

/// Applies a plan to a simulated directory, failing if any rename collides.
///
/// This is the whole point: a plan is correct only if every rename lands on a free name
/// at the moment it happens.
fn apply(plan: &RenumberPlan, start: &[&str]) -> HashSet<String> {
    let mut present: HashSet<String> = start.iter().map(|s| (*s).to_owned()).collect();

    for rename in plan.renames() {
        assert!(
            present.contains(rename.from.as_str()),
            "renaming {} which is not present; plan: {:?}",
            rename.from.as_str(),
            plan.renames()
        );
        assert!(
            !present.contains(rename.to.as_str()),
            "renaming {} onto {}, which is occupied; plan: {:?}",
            rename.from.as_str(),
            rename.to.as_str(),
            plan.renames()
        );

        present.remove(rename.from.as_str());
        present.insert(rename.to.as_str().to_owned());
    }

    present
}

#[test]
fn a_vault_whose_prefixes_already_match_needs_no_renames() {
    let plan = plan_renumber(
        &folders(&[("01-intro", "a0"), ("02-raft", "a1")]),
        &directories(&["01-intro", "02-raft"]),
    )
    .unwrap();

    assert!(plan.is_empty());
    assert!(plan.blocked().is_empty());
}

#[test]
fn adds_prefixes_to_a_vault_that_has_never_been_numbered() {
    let plan = plan_renumber(
        &folders(&[("intro", "a0"), ("raft", "a1"), ("paxos", "a2")]),
        &directories(&["intro", "raft", "paxos"]),
    )
    .unwrap();

    let after = apply(&plan, &["intro", "raft", "paxos"]);

    assert_eq!(
        sorted(&after),
        ["01-intro", "02-raft", "03-paxos"],
        "prefixes should follow sequence order"
    );
}

/// The case the old rule handled: everything shifts up by one.
#[test]
fn inserting_at_the_front_shifts_the_rest_without_a_temporary_name() {
    // `Zz` sorts before `a0`, so the new lecture takes position 1.
    let plan = plan_renumber(
        &folders(&[("01-intro", "a0"), ("02-raft", "a1"), ("new-lecture", "Zz")]),
        &directories(&["01-intro", "02-raft", "new-lecture"]),
    )
    .unwrap();

    let after = apply(&plan, &["01-intro", "02-raft", "new-lecture"]);

    assert_eq!(sorted(&after), ["01-new-lecture", "02-intro", "03-raft"]);
    assert!(
        !plan
            .renames()
            .iter()
            .any(|r| r.to.as_str().contains(RENUMBERING_SUFFIX)),
        "a pure shift needs no temporary name: {:?}",
        plan.renames()
    );
}

/// Differing stems make most reorders collision-free for free.
#[test]
fn reordering_folders_with_different_stems_needs_no_temporary_name() {
    // `01-intro` -> `02-intro` does not touch `02-raft`, because the stem is part of the
    // name. This is why the hard case below is specifically about *shared* stems, and it
    // corrects my first attempt at this test, which claimed a cycle here.
    let plan = plan_renumber(
        &folders(&[("01-intro", "a1"), ("02-raft", "a2"), ("03-paxos", "a0")]),
        &directories(&["01-intro", "02-raft", "03-paxos"]),
    )
    .unwrap();

    let after = apply(&plan, &["01-intro", "02-raft", "03-paxos"]);

    assert_eq!(sorted(&after), ["01-paxos", "02-intro", "03-raft"]);
    assert_eq!(
        plan.renames()
            .iter()
            .filter(|r| r.to.as_str().contains(RENUMBERING_SUFFIX))
            .count(),
        0,
        "differing stems cannot collide, so no temporary name is needed: {:?}",
        plan.renames()
    );
}

/// The case the old rule could not handle: siblings sharing a stem.
#[test]
fn a_cycle_among_shared_stems_is_broken_with_exactly_one_temporary_name() {
    // Generic folder names are common, and siblings sharing a stem reorder as a pure
    // permutation of their prefixes. Dragging the third to the front makes 01->02,
    // 02->03, 03->01, where every target is held by another member of the cycle.
    let plan = plan_renumber(
        &folders(&[
            ("01-lecture", "a1"),
            ("02-lecture", "a2"),
            ("03-lecture", "a0"),
        ]),
        &directories(&["01-lecture", "02-lecture", "03-lecture"]),
    )
    .unwrap();

    let after = apply(&plan, &["01-lecture", "02-lecture", "03-lecture"]);

    assert_eq!(
        sorted(&after),
        ["01-lecture", "02-lecture", "03-lecture"],
        "the set of names is unchanged; which lecture holds each one is what moved"
    );
    assert_eq!(
        plan.renames()
            .iter()
            .filter(|r| r.to.as_str().contains(RENUMBERING_SUFFIX))
            .count(),
        1,
        "one temporary name is the minimum, and enough: {:?}",
        plan.renames()
    );
}

#[test]
fn a_two_way_swap_of_shared_stems_is_also_a_cycle() {
    let plan = plan_renumber(
        &folders(&[("01-lecture", "a1"), ("02-lecture", "a0")]),
        &directories(&["01-lecture", "02-lecture"]),
    )
    .unwrap();

    let after = apply(&plan, &["01-lecture", "02-lecture"]);

    assert_eq!(sorted(&after), ["01-lecture", "02-lecture"]);
    assert_eq!(plan.len(), 3, "two moves, one through a temporary name");
}

/// The property, stated directly.
#[test]
fn no_plan_ever_renames_onto_an_occupied_name() {
    // A spread of shapes: shifts, reversals, cycles of several lengths, and a vault with
    // no prefixes at all. `apply` panics on any collision.
    let shapes: &[&[(&str, &str)]] = &[
        &[("01-a", "a0"), ("02-b", "a1"), ("03-c", "a2")],
        &[("01-a", "a2"), ("02-b", "a1"), ("03-c", "a0")],
        &[("01-a", "a1"), ("02-b", "a2"), ("03-c", "a0")],
        &[("01-a", "a2"), ("02-b", "a0"), ("03-c", "a1")],
        &[("03-a", "a0"), ("01-b", "a1"), ("02-c", "a2")],
        &[("a", "a0"), ("b", "a1"), ("c", "a2")],
        // Shared stems, which is where the genuine cycles live.
        &[("01-x", "a1"), ("02-x", "a0")],
        &[("01-x", "a1"), ("02-x", "a2"), ("03-x", "a0")],
        &[("01-x", "a2"), ("02-x", "a0"), ("03-x", "a1")],
        &[
            ("01-x", "a3"),
            ("02-x", "a2"),
            ("03-x", "a1"),
            ("04-x", "a0"),
        ],
        // A cycle beside an independent mover.
        &[("01-x", "a1"), ("02-x", "a0"), ("plain", "a2")],
        &[
            ("01-a", "a4"),
            ("02-b", "a3"),
            ("03-c", "a2"),
            ("04-d", "a1"),
            ("05-e", "a0"),
        ],
    ];

    for shape in shapes {
        let names: Vec<&str> = shape.iter().map(|(name, _)| *name).collect();
        let plan = plan_renumber(&folders(shape), &directories(&names)).unwrap();

        let after = apply(&plan, &names);

        assert_eq!(after.len(), names.len(), "no folder may be lost: {shape:?}");
        assert!(
            after.iter().all(|n| !n.contains(RENUMBERING_SUFFIX)),
            "no temporary name may survive the plan: {after:?}"
        );
    }
}

#[test]
fn widens_the_prefix_so_a_hundred_lectures_still_sort_correctly() {
    // With a fixed two digits, `100-` sorts before `99-` as text, which breaks the one
    // thing prefixes are for.
    assert_eq!(position_width(3), 2);
    assert_eq!(position_width(99), 2);
    assert_eq!(position_width(100), 3);

    // Built with the key type's own API rather than hand-written strings: a key like
    // "a000" is not canonical and is rightly refused.
    let mut sequence = OrderKey::first();
    let mut many: Vec<OrderedFolder> = Vec::new();
    let mut owned: Vec<String> = Vec::new();
    for i in 0..100 {
        let name = format!("lecture-{i:03}");
        many.push(OrderedFolder::new(slug(&name), sequence.clone()));
        owned.push(name);
        sequence = OrderKey::between(Some(&sequence), None).unwrap();
    }
    let names: Vec<&str> = owned.iter().map(String::as_str).collect();

    let plan = plan_renumber(&many, &directories(&names)).unwrap();
    let after = apply(&plan, &names);

    assert!(after.contains("001-lecture-000"));
    assert!(after.contains("100-lecture-099"));
}

/// Resumability: a leftover temporary name must not become permanent.
#[test]
fn recovers_from_a_renumber_that_was_interrupted() {
    // As if the app had died mid-rename, leaving one folder under its temporary name.
    let leftover = format!("03-paxos{RENUMBERING_SUFFIX}");
    let plan = plan_renumber(
        &folders(&[
            ("01-intro", "a1"),
            ("02-raft", "a2"),
            (leftover.as_str(), "a0"),
        ]),
        &directories(&["01-intro", "02-raft", leftover.as_str()]),
    )
    .unwrap();

    let after = apply(&plan, &["01-intro", "02-raft", leftover.as_str()]);

    assert_eq!(
        sorted(&after),
        ["01-paxos", "02-intro", "03-raft"],
        "re-running must finish the job, not bake the temporary name in"
    );
}

fn sorted(names: &HashSet<String>) -> Vec<String> {
    let mut out: Vec<String> = names.iter().cloned().collect();
    out.sort();
    out
}
