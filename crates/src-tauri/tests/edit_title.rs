//! Renaming a lecture, and the rule that makes renaming safe.
//!
//! Split from `edit.rs` at the seam the concern already had: that file is about the
//! taxonomy, this one about the name and about absent-versus-empty, which is the rule a
//! rename depends on. Same command, same fixture shape, different question.
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

use nexus_app::edit::{LectureEdit, apply_edit};
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

fn edit(course: &str, module: &str, week: &str, tags: &[&str]) -> LectureEdit {
    LectureEdit {
        title: None,
        course: Some(course.to_owned()),
        module: Some(module.to_owned()),
        week: Some(week.to_owned()),
        tags: Some(tags.iter().map(|tag| (*tag).to_owned()).collect()),
    }
}

/// An edit that renames and changes nothing else.
fn rename(title: &str) -> LectureEdit {
    LectureEdit {
        title: Some(title.to_owned()),
        ..LectureEdit::default()
    }
}

#[test]
fn a_lecture_can_be_renamed_without_moving_its_folder() {
    // The case the real vault argued for: a lecture imported from a university download is
    // called `TMSCOMSSAD18~TMSCOMSSSE01~2026~1`, and nothing could fix that until now.
    // §3 keeps the folder a derived projection, so the rename must not move anything.
    let fixture = Fixture::new();

    let renamed = apply_edit(
        &fixture.vault(),
        "raft-consensus",
        &rename("Raft, Paxos and the cost of agreement"),
    )
    .unwrap();

    assert_eq!(renamed.title, "Raft, Paxos and the cost of agreement");
    assert_eq!(
        renamed.directory, "raft-consensus",
        "renaming a lecture must not move it"
    );
    assert!(fixture.vault.join("raft-consensus").is_dir());

    // And it survives a reopen, which is the only proof the manifest was really written.
    let summary = open_vault(&fixture.vault()).unwrap();
    assert_eq!(
        summary.lectures[0].title,
        "Raft, Paxos and the cost of agreement"
    );
}

#[test]
fn a_rename_leaves_the_facets_alone_and_filing_leaves_the_title_alone() {
    // One command does both, so each has to be able to happen without the other. A rename
    // that quietly cleared someone's taxonomy would be exactly the silent loss §1.4 rules
    // out.
    let fixture = Fixture::new();

    apply_edit(
        &fixture.vault(),
        "raft-consensus",
        &edit("CS454", "Consensus", "Week 3", &["exam"]),
    )
    .unwrap();

    let renamed = apply_edit(
        &fixture.vault(),
        "raft-consensus",
        &rename("Leader election"),
    )
    .unwrap();

    assert_eq!(renamed.title, "Leader election");
    assert_eq!(renamed.course.as_deref(), Some("CS454"), "facets kept");
    assert_eq!(renamed.week.as_deref(), Some("Week 3"));
    assert_eq!(renamed.tags, vec!["exam"]);

    // And now the other direction: filing it again must not revert the name.
    let filed = apply_edit(
        &fixture.vault(),
        "raft-consensus",
        &edit("CS454", "Consensus", "Week 4", &["exam"]),
    )
    .unwrap();

    assert_eq!(filed.title, "Leader election", "title kept");
    assert_eq!(filed.week.as_deref(), Some("Week 4"));
}

#[test]
fn a_blank_title_is_refused_rather_than_silently_ignored() {
    // Keeping the old title would tell someone their rename worked. A lecture with no
    // facets is normal; a lecture with no name is not.
    let fixture = Fixture::new();

    let error = apply_edit(&fixture.vault(), "raft-consensus", &rename("   "))
        .expect_err("a blank title should be refused");

    assert_eq!(error.code, "ERR_LECTURE_NEEDS_A_NAME");
    assert!(!error.remediation.is_empty());

    // The lecture keeps the name it had.
    let summary = open_vault(&fixture.vault()).unwrap();
    assert_eq!(summary.lectures[0].title, "Raft Consensus");
}

#[test]
fn an_absent_field_keeps_what_was_there_and_an_empty_one_clears_it() {
    // The distinction a rename depends on. These arrive as the same JSON shape otherwise,
    // and treating absent as empty is what made a rename wipe the taxonomy.
    let fixture = Fixture::new();
    apply_edit(
        &fixture.vault(),
        "raft-consensus",
        &edit("CS454", "Consensus", "Week 3", &["exam"]),
    )
    .unwrap();

    // Absent: everything stays.
    let untouched =
        apply_edit(&fixture.vault(), "raft-consensus", &LectureEdit::default()).unwrap();

    assert_eq!(untouched.course.as_deref(), Some("CS454"));
    assert_eq!(untouched.module.as_deref(), Some("Consensus"));
    assert_eq!(untouched.week.as_deref(), Some("Week 3"));
    assert_eq!(untouched.tags, vec!["exam"]);
    assert_eq!(untouched.title, "Raft Consensus");

    // Present and empty: that field goes, and only that field.
    let partly = apply_edit(
        &fixture.vault(),
        "raft-consensus",
        &LectureEdit {
            week: Some(String::new()),
            tags: Some(Vec::new()),
            ..LectureEdit::default()
        },
    )
    .unwrap();

    assert_eq!(partly.week, None, "an empty field clears it");
    assert!(partly.tags.is_empty(), "an empty list clears the tags");
    assert_eq!(partly.course.as_deref(), Some("CS454"), "the rest stays");
    assert_eq!(partly.module.as_deref(), Some("Consensus"));
}
