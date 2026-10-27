//! Contract tests for [`scan_vault`]: finding the lectures in a vault.
//!
//! No filesystem is touched. That is the point of the `VaultDirectory` port: the rules
//! being tested — a lecture is a directory with a `manifest.json`, prune at the first one
//! — are domain rules, and describing a tree in memory is faster and more thorough than
//! creating one on disk.
//!
//! What the walk *cannot* use, and how it reports that, lives in
//! `vault_scan_reporting.rs`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod support;

use lecture_core::{DirectoryEntry, MAX_BUNDLE_DEPTH, scan_vault};

use support::{FakeVault, found};

#[test]
fn an_empty_vault_holds_no_lectures() {
    let scan = scan_vault(&FakeVault::default()).unwrap();

    assert!(scan.is_empty());
    assert!(scan.skipped().is_empty());
}

#[test]
fn a_directory_with_a_manifest_is_a_lecture() {
    let vault = FakeVault::default().lecture("raft-consensus");

    assert_eq!(found(&vault), ["raft-consensus"]);
}

#[test]
fn a_directory_without_a_manifest_is_not_a_lecture() {
    // The grouping folders a person makes are not lectures themselves.
    let vault = FakeVault::default()
        .folder("cs454")
        .lecture("cs454/raft-consensus");

    assert_eq!(found(&vault), ["cs454/raft-consensus"]);
}

#[test]
fn finds_lectures_at_several_different_depths() {
    let vault = FakeVault::default()
        .lecture("quick-note")
        .lecture("cs454/raft")
        .lecture("y1/cs454/consensus/week-03/paxos");

    assert_eq!(
        found(&vault),
        [
            "cs454/raft",
            "quick-note",
            "y1/cs454/consensus/week-03/paxos"
        ]
    );
}

/// The pruning rule.
#[test]
fn a_bundle_s_own_subfolders_are_not_mistaken_for_lectures() {
    // `source/` and `assets/` live inside every lecture. Without pruning they would be
    // walked, and anything resembling a manifest inside them would multiply the lecture.
    let vault = FakeVault::default().lecture("cs454/raft");
    let scan = scan_vault(&vault).unwrap();

    assert_eq!(scan.len(), 1, "one lecture, not three");
    assert!(scan.skipped().is_empty());
}

#[test]
fn a_lecture_at_the_deepest_allowed_level_is_found() {
    let deepest = "y1/cs454/consensus/week-03/raft";
    assert_eq!(deepest.split('/').count(), MAX_BUNDLE_DEPTH);

    let vault = FakeVault::default().lecture(deepest);

    assert_eq!(found(&vault), [deepest]);
}

#[test]
fn results_are_ordered_regardless_of_listing_order() {
    // A filesystem gives no order guarantee, and the sidebar should not flicker between
    // runs. Declared here in a deliberately unhelpful order.
    let vault = FakeVault::default()
        .lecture("zz-last")
        .lecture("aa-first")
        .lecture("mm-middle");

    assert_eq!(found(&vault), ["aa-first", "mm-middle", "zz-last"]);
}

#[test]
fn a_manifest_that_is_a_directory_does_not_make_a_lecture() {
    // Pathological but cheap to be right about: a *directory* called manifest.json is
    // not a manifest, and treating it as one would produce a lecture that cannot load.
    let mut vault = FakeVault::default().folder("cs454/odd");
    vault.entries.insert(
        "cs454/odd".to_owned(),
        vec![DirectoryEntry::directory("manifest.json")],
    );
    vault
        .entries
        .insert("cs454/odd/manifest.json".to_owned(), Vec::new());

    let scan = scan_vault(&vault).unwrap();

    assert!(scan.is_empty());
}
