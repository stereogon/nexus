//! Contract tests for what a reorganize must never do to someone's files.
//!
//! Four guarantees. It never writes over something it does not own -- POSIX `rename`
//! replaces silently, so a target that is already taken is a data-loss path rather than a
//! tidiness one. It never writes a `manifest.json`, because facets are the real taxonomy
//! and this only moves folders to match them. A lecture it cannot file is reported rather
//! than quietly counted as needing no change. And stopping half-way leaves a vault that
//! still opens and that re-running finishes.
//!
//! The filing itself lives in `reorganize_store.rs`.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

mod support;

use std::fs;

use lecture_core::{PathTemplate, ReorganizeBlock};
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
fn a_target_something_else_holds_is_blocked_and_nothing_is_written_over() {
    let dir = TempDir::new().unwrap();
    write_filed_lecture(dir.path(), "raft", "Raft", "CS454", "Week 3");

    // Exactly the name the lecture wants, holding something that is not a lecture.
    fs::create_dir_all(dir.path().join("cs454")).unwrap();
    let occupied = dir.path().join("cs454/week-3-raft");
    fs::write(&occupied, b"someone's notes\n").unwrap();

    let reorganize = reorganize(dir.path());
    let plan = reorganize
        .plan(&load(dir.path()), &template("{course}/{week}-{title}"))
        .unwrap();

    assert!(plan.moves().is_empty(), "the planner should refuse it");
    assert_eq!(plan.blocked().len(), 1);
    assert_eq!(
        plan.blocked()[0].reason,
        ReorganizeBlock::TargetOccupied,
        "and say why in terms of the obstacle"
    );

    reorganize.apply(&plan).unwrap();

    assert_eq!(
        fs::read_to_string(&occupied).unwrap(),
        "someone's notes\n",
        "the file must be untouched"
    );
    assert!(lecture_at(dir.path(), "raft"), "and the lecture stays put");
}

#[test]
fn two_lectures_wanting_one_folder_are_both_blocked_rather_than_one_overwriting_the_other() {
    let dir = TempDir::new().unwrap();
    write_filed_lecture(dir.path(), "a", "Raft", "CS454", "Week 3");
    write_filed_lecture(dir.path(), "b", "Raft", "CS454", "Week 3");

    let plan = reorganize(dir.path())
        .plan(&load(dir.path()), &template("{course}/{week}-{title}"))
        .unwrap();

    assert!(plan.moves().is_empty());
    assert_eq!(plan.blocked().len(), 2);

    for blocked in plan.blocked() {
        assert_eq!(blocked.reason, ReorganizeBlock::SharedTarget);
        assert!(!blocked.reason.remediation().is_empty());
    }
}

#[test]
fn a_lecture_with_no_facets_is_reported_rather_than_silently_left_alone() {
    // I expected this to land at `raft`: a level with no value is dropped, so I assumed
    // only `{course}/` would go. But the level holding `{title}` names `{week}` too, so
    // BOTH drop and there is no target at all.
    //
    // Which makes the right answer to report it. Being unfiled is the normal state
    // immediately after import, and "give this a week and I can file it" is something a
    // person can act on, where counting it as needing no change is a mystery.
    //
    // `PatternNeedsFacets`, not `NameUnusable`: the title here is "Raft", which is a
    // perfectly good folder name. What is missing is the course and the week. This
    // assertion read `NameUnusable` until 2026-10-28 and was wrong in a way no test caught,
    // because the reason was discarded before it reached here.
    let dir = TempDir::new().unwrap();
    write_lecture(dir.path(), "whatever-the-download-was-called", "Raft", "a0");

    let reorganize = reorganize(dir.path());
    let plan = reorganize
        .plan(&load(dir.path()), &template("{course}/{week}-{title}"))
        .unwrap();

    assert!(plan.moves().is_empty());
    assert_eq!(plan.unchanged(), 0, "it is blocked, not unchanged");
    assert_eq!(plan.blocked().len(), 1);
    assert_eq!(
        plan.blocked()[0].reason,
        ReorganizeBlock::PatternNeedsFacets
    );
    assert!(
        plan.blocked()[0].reason.remediation().contains("facets"),
        "the advice must point at the missing facets, not at the title"
    );
    assert_eq!(
        plan.blocked()[0].wanted,
        None,
        "there is nowhere it wanted to be"
    );
    assert!(!plan.blocked()[0].reason.remediation().is_empty());

    reorganize.apply(&plan).unwrap();

    assert!(
        lecture_at(dir.path(), "whatever-the-download-was-called"),
        "and it stays exactly where it was"
    );
}

#[test]

fn stopping_half_way_leaves_a_vault_that_still_opens_and_re_running_finishes_it() {
    // §3: no central index is a source of truth, and everything inside a bundle is
    // referenced relatively. So a lecture that moved and one that did not are both still
    // lectures. This is what makes a partial reorganize recoverable rather than a mess.
    let dir = TempDir::new().unwrap();
    write_filed_lecture(dir.path(), "raft", "Raft", "CS454", "Week 1");
    write_filed_lecture(dir.path(), "paxos", "Paxos", "CS454", "Week 2");

    let pattern = template("{course}/{week}-{title}");
    let reorganize = reorganize(dir.path());
    let plan = reorganize.plan(&load(dir.path()), &pattern).unwrap();
    assert_eq!(plan.moves().len(), 2);

    // Apply only the first move, by planning again from a vault holding just one lecture.
    let first = &plan.moves()[0];
    fs::create_dir_all(dir.path().join("cs454")).unwrap();
    fs::rename(
        dir.path().join(first.from.to_string()),
        dir.path().join(first.to.to_string()),
    )
    .unwrap();

    // The vault still opens, with both lectures, one moved and one not.
    let halfway = load(dir.path());
    assert_eq!(halfway.bundles.len(), 2);
    assert!(halfway.unloadable.is_empty());

    // And re-running finishes the job.
    let again = reorganize.plan(&halfway, &pattern).unwrap();
    assert_eq!(again.moves().len(), 1, "only the unfinished one is left");

    let outcome = reorganize.apply(&again).unwrap();

    assert!(outcome.is_complete());
    assert!(lecture_at(dir.path(), "cs454/week-1-raft"));
    assert!(lecture_at(dir.path(), "cs454/week-2-paxos"));
}

#[test]
fn a_plan_touches_nothing_until_it_is_applied() {
    let dir = TempDir::new().unwrap();
    write_filed_lecture(dir.path(), "raft", "Raft", "CS454", "Week 3");

    let before = fs::read(dir.path().join("raft/manifest.json")).unwrap();

    reorganize(dir.path())
        .plan(&load(dir.path()), &template("{course}/{week}-{title}"))
        .unwrap();

    assert!(
        lecture_at(dir.path(), "raft"),
        "the dry run moved something"
    );
    assert!(!dir.path().join("cs454").exists(), "it created a folder");
    assert_eq!(
        fs::read(dir.path().join("raft/manifest.json")).unwrap(),
        before,
        "a reorganize must never write a manifest: it moves folders"
    );
}

#[test]
fn the_manifest_travels_unchanged_so_a_moved_bundle_needs_no_rewriting() {
    let dir = TempDir::new().unwrap();
    write_filed_lecture(dir.path(), "raft", "Raft", "CS454", "Week 3");

    let before = fs::read(dir.path().join("raft/manifest.json")).unwrap();

    let reorganize = reorganize(dir.path());
    let plan = reorganize
        .plan(&load(dir.path()), &template("{course}/{week}-{title}"))
        .unwrap();
    reorganize.apply(&plan).unwrap();

    assert_eq!(
        fs::read(dir.path().join("cs454/week-3-raft/manifest.json")).unwrap(),
        before,
        "nothing inside a bundle records where the bundle is"
    );
    assert_eq!(
        load(dir.path()).bundles[0]
            .document_path()
            .unwrap()
            .unwrap()
            .to_string(),
        "cs454/week-3-raft/source/document.pdf",
        "and the document still resolves from its new home"
    );
}
