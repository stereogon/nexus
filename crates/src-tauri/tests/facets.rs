//! Filing a lecture under a course, module, week and tags.
//!
//! Against a temporary vault: `CLAUDE.md` §2 puts pointing the app at a real `StudyVault`
//! behind asking first, and a test is where that would be easiest to do by accident.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use std::fs;
use std::path::PathBuf;

use lecture_core::{Facets, Label, RelativePath};
use lecture_fs::{AtomicFsStorage, ManifestStore, SystemClock, VaultRoot};
use nexus_app::facets::{FacetEdit, file_under};
use nexus_app::import::bring_in;
use nexus_app::vault::open_vault;
use tempfile::TempDir;

/// A vault holding one imported lecture.
struct Fixture {
    _held: TempDir,
    vault: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let held = TempDir::new().unwrap();
        let vault = held.path().join("vault");
        let inbox = held.path().join("inbox");
        fs::create_dir_all(&vault).unwrap();
        fs::create_dir_all(&inbox).unwrap();

        let document = inbox.join("Raft Consensus.pdf");
        fs::write(
            &document,
            b"%PDF-1.7\na real file, if not a real document\n",
        )
        .unwrap();

        let fixture = Self { _held: held, vault };
        bring_in(&fixture.vault(), &document.display().to_string()).unwrap();

        fixture
    }

    fn vault(&self) -> String {
        self.vault.display().to_string()
    }
}

fn edit(course: &str, module: &str, week: &str, tags: &[&str]) -> FacetEdit {
    FacetEdit {
        course: Some(course.to_owned()),
        module: Some(module.to_owned()),
        week: Some(week.to_owned()),
        tags: tags.iter().map(|tag| (*tag).to_owned()).collect(),
    }
}

#[test]
fn a_lecture_can_be_filed_without_moving_it() {
    // The whole point of facets over folders: the taxonomy changes and the bundle stays
    // exactly where it is, so nothing inside it needs rewriting.
    let fixture = Fixture::new();

    let filed = file_under(
        &fixture.vault(),
        "raft-consensus",
        &edit(
            "CS454 Distributed Systems",
            "Consensus",
            "Week 3",
            &["exam"],
        ),
    )
    .unwrap();

    assert_eq!(filed.course.as_deref(), Some("CS454 Distributed Systems"));
    assert_eq!(filed.module.as_deref(), Some("Consensus"));
    assert_eq!(filed.week.as_deref(), Some("Week 3"));
    assert_eq!(filed.tags, vec!["exam"]);
    assert_eq!(
        filed.directory, "raft-consensus",
        "filing a lecture must not move it"
    );
    assert!(fixture.vault.join("raft-consensus").is_dir());
}

#[test]
fn the_facets_are_there_the_next_time_the_vault_is_opened() {
    let fixture = Fixture::new();
    file_under(
        &fixture.vault(),
        "raft-consensus",
        &edit("CS454", "Consensus", "Week 3", &["exam", "theory"]),
    )
    .unwrap();

    let summary = open_vault(&fixture.vault()).unwrap();

    assert_eq!(summary.lectures[0].course.as_deref(), Some("CS454"));
    assert_eq!(summary.lectures[0].week.as_deref(), Some("Week 3"));
    assert_eq!(summary.lectures[0].tags, vec!["exam", "theory"]);
}

#[test]
fn a_blank_field_clears_a_facet_rather_than_being_ignored() {
    // A taxonomy you can only add to is one you cannot correct, so "no week" has to be
    // expressible.
    let fixture = Fixture::new();
    file_under(
        &fixture.vault(),
        "raft-consensus",
        &edit("CS454", "Consensus", "Week 3", &["exam"]),
    )
    .unwrap();

    let cleared = file_under(
        &fixture.vault(),
        "raft-consensus",
        &edit("CS454", "", "   ", &[]),
    )
    .unwrap();

    assert_eq!(cleared.course.as_deref(), Some("CS454"));
    assert_eq!(cleared.module, None, "an empty field clears the facet");
    assert_eq!(cleared.week, None, "and so does a whitespace-only one");
    assert!(cleared.tags.is_empty());
}

#[test]
fn custom_keys_someone_added_by_hand_survive_an_edit() {
    // This command edits the four named facets. Dropping keys it does not understand would
    // be exactly the silent loss §1.4 rules out -- and `custom` is an open map precisely so
    // a person can put something there.
    let fixture = Fixture::new();
    let bundle = RelativePath::parse("raft-consensus").unwrap();
    let manifests = ManifestStore::new(
        AtomicFsStorage::new(VaultRoot::open(&fixture.vault).unwrap()),
        SystemClock,
    );

    let held = manifests.load(&bundle).unwrap();
    let with_custom = held.with_facets(
        Facets::empty()
            .with_custom("lecturer", Label::parse("Dr Ada Lovelace").unwrap())
            .unwrap(),
    );
    manifests.save(&bundle, &with_custom).unwrap();

    file_under(
        &fixture.vault(),
        "raft-consensus",
        &edit("CS454", "Consensus", "Week 3", &[]),
    )
    .unwrap();

    let after = manifests.load(&bundle).unwrap();

    assert_eq!(
        after.facets().custom().get("lecturer").map(Label::as_str),
        Some("Dr Ada Lovelace"),
        "a custom key was dropped by an edit that never mentioned it"
    );
    assert_eq!(after.facets().course().map(Label::as_str), Some("CS454"));
}

#[test]
fn a_facet_that_cannot_be_a_label_is_refused_with_something_to_do_about_it() {
    let fixture = Fixture::new();

    let error = file_under(
        &fixture.vault(),
        "raft-consensus",
        &edit("CS454", "Consensus", &"w".repeat(1000), &[]),
    )
    .expect_err("an impossibly long week should be refused");

    assert!(error.code.starts_with("ERR_"), "code was {}", error.code);
    assert!(!error.remediation.is_empty());
}

#[test]
fn a_lecture_that_is_not_there_is_refused_before_anything_is_written() {
    let fixture = Fixture::new();

    let error = file_under(&fixture.vault(), "no-such-lecture", &FacetEdit::default())
        .expect_err("a missing lecture should be refused");

    assert!(error.code.starts_with("ERR_"));
    // And the lecture that *is* there is untouched.
    assert_eq!(open_vault(&fixture.vault()).unwrap().lectures.len(), 1);
}
