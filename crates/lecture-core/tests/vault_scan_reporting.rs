//! Contract tests for what [`scan_vault`] reports rather than silently omits.
//!
//! The governing rule: if a lecture vanished from the sidebar with no explanation, the
//! natural conclusion would be that the app lost it. So an unusable folder name, a
//! folder nested past the cap, an unreadable directory and a lecture buried inside
//! another lecture all come back with a reason to show.
//!
//! Finding lectures lives in `vault_scan.rs`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod support;

use lecture_core::{SkipReason, scan_vault};

use support::FakeVault;

/// Nothing vanishes without an explanation.
#[test]
fn a_lecture_inside_a_lecture_is_reported_rather_than_lost() {
    // Dragging one lecture into another is an easy mistake, and the symptom -- a lecture
    // disappearing from the sidebar -- looks exactly like the app losing it.
    let vault = FakeVault::default()
        .lecture("cs454/raft")
        .lecture("cs454/raft/buried-lecture");

    let scan = scan_vault(&vault).unwrap();

    assert_eq!(
        scan.lectures()
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>(),
        ["cs454/raft"],
        "only the outer lecture is addressable"
    );
    assert_eq!(scan.skipped().len(), 1);
    let skipped = scan.skipped().first().unwrap();
    assert_eq!(skipped.shown_path, "cs454/raft/buried-lecture");
    assert_eq!(skipped.reason, SkipReason::LectureInsideLecture);
    assert!(skipped.reason.remediation().contains("Nothing was changed"));
}

#[test]
fn finds_a_lecture_buried_deeper_inside_a_bundle() {
    let vault = FakeVault::default()
        .lecture("cs454/raft")
        .lecture("cs454/raft/assets/oops");

    let scan = scan_vault(&vault).unwrap();

    assert_eq!(scan.len(), 1);
    assert_eq!(
        scan.skipped().first().unwrap().reason,
        SkipReason::LectureInsideLecture
    );
}

#[test]
fn hidden_directories_are_skipped_without_comment() {
    // `.nexus` is a rebuildable cache and `.git` is none of our business. Reporting them
    // would be noise, and noise is what makes a real warning get ignored.
    let vault = FakeVault::default()
        .folder(".nexus/cache")
        .folder(".git/objects")
        .lecture("cs454/raft");

    let scan = scan_vault(&vault).unwrap();

    assert_eq!(scan.len(), 1);
    assert!(
        scan.skipped().is_empty(),
        "hidden directories are expected, not problems: {:?}",
        scan.skipped()
    );
}

#[test]
fn a_folder_whose_name_cannot_be_used_is_reported() {
    // Legal on APFS, unusable on a device the vault may sync to. The lecture inside it
    // would otherwise be invisible with no explanation.
    let vault = FakeVault::default().folder("cs454/week 3 ");

    let scan = scan_vault(&vault).unwrap();

    assert_eq!(scan.skipped().len(), 1);
    let skipped = scan.skipped().first().unwrap();
    assert_eq!(skipped.shown_path, "cs454/week 3 ");
    assert_eq!(skipped.reason, SkipReason::UnusableName);
    assert!(skipped.reason.remediation().contains("Renaming"));
}

#[test]
fn an_unreadable_directory_does_not_abort_the_whole_scan() {
    // One folder mid-sync must not make a vault unopenable.
    let vault = FakeVault::default()
        .lecture("cs454/raft")
        .unreadable("cs454/locked")
        .lecture("cs999/paxos");

    let scan = scan_vault(&vault).unwrap();

    assert_eq!(
        scan.lectures()
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>(),
        ["cs454/raft", "cs999/paxos"],
        "the readable lectures must still be found"
    );
    assert_eq!(
        scan.skipped().first().unwrap().reason,
        SkipReason::Unreadable
    );
}

#[test]
fn an_unreadable_vault_root_is_an_error_because_there_is_nothing_to_scan() {
    let mut vault = FakeVault::default();
    vault.unreadable.push(String::new());

    assert!(scan_vault(&vault).is_err());
}

#[test]
fn a_folder_nested_past_the_cap_is_reported_only_if_something_is_inside_it() {
    // Past the cap with content below: a lecture may be down there, so say so.
    let too_deep = FakeVault::default().folder("a/b/c/d/e/f/lecture-maybe");
    let scan = scan_vault(&too_deep).unwrap();
    assert!(scan.is_empty());
    assert_eq!(
        scan.skipped().first().unwrap().reason,
        SkipReason::TooDeeplyNested
    );
    assert_eq!(scan.skipped().first().unwrap().shown_path, "a/b/c/d/e");

    // Past the cap but empty: nothing is being lost, so nothing is reported.
    let harmless = FakeVault::default().folder("a/b/c/d/e");
    let scan = scan_vault(&harmless).unwrap();
    assert!(scan.is_empty());
    assert!(
        scan.skipped().is_empty(),
        "an empty deep folder loses nothing, so warning about it is noise"
    );
}
