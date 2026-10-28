//! The reorganize commands: the dry run, the apply, and what follows a lecture when it moves.
//!
//! Against a temporary vault *and* a temporary device-state directory. §1.9 puts the real
//! `~/Library/Application Support` out of bounds, and a test is where it would be easiest
//! to write there by accident -- which is why `apply_under` exists.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use std::fs;
use std::path::{Path, PathBuf};

use lecture_core::{LectureView, PageNumber, RelativePath, ViewState};
use lecture_fs::{DeviceStateStore, VaultRoot};
use nexus_app::facets::{FacetEdit, file_under};
use nexus_app::import::bring_in;
use nexus_app::reorganize::{apply_under, preview};
use nexus_app::vault::open_vault;
use tempfile::TempDir;

const TEMPLATE: &str = "{course}/{week}-{title}";

/// A vault with one filed lecture, plus somewhere to keep device state.
struct Fixture {
    /// The temporary directory the rest of these paths live in. Held so it outlives the
    /// fixture rather than being deleted the moment it is created -- and read, now that
    /// one test needs a path inside it that the fixture does not already name.
    held: TempDir,
    vault: PathBuf,
    state: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let held = TempDir::new().unwrap();
        let vault = held.path().join("vault");
        let inbox = held.path().join("inbox");
        let state = held.path().join("state");
        for directory in [&vault, &inbox, &state] {
            fs::create_dir_all(directory).unwrap();
        }

        let document = inbox.join("Raft Consensus.pdf");
        fs::write(
            &document,
            b"%PDF-1.7\nnot a real document, but a real file\n",
        )
        .unwrap();

        let fixture = Self { held, vault, state };
        bring_in(&fixture.vault(), &document.display().to_string()).unwrap();

        fixture
    }

    fn vault(&self) -> String {
        self.vault.display().to_string()
    }

    /// Files the lecture at `directory` under a course and week.
    fn file(&self, directory: &str, course: &str, week: &str) {
        file_under(
            &self.vault(),
            directory,
            &FacetEdit {
                course: Some(course.to_owned()),
                module: None,
                week: Some(week.to_owned()),
                tags: Vec::new(),
            },
        )
        .unwrap();
    }

    fn apply(&self) -> nexus_app::reorganize::ReorganizeResult {
        apply_under(&self.state, &self.vault(), TEMPLATE).unwrap()
    }

    /// A path where per-device state cannot be kept, because it is a plain file.
    ///
    /// The cheapest real way to make the view-state write fail. Faking it would mean
    /// injecting a failing storage, and what is under test here is the decision about what
    /// to do when the real one fails.
    fn blocked_state(&self) -> PathBuf {
        let path = self.held.path().join("state-file");
        fs::write(&path, b"not a directory\n").unwrap();

        path
    }
}

fn lecture_at(root: &Path, directory: &str) -> bool {
    root.join(directory).join("manifest.json").is_file()
}

#[test]
fn the_dry_run_says_what_would_happen_and_touches_nothing() {
    let fixture = Fixture::new();
    fixture.file("raft-consensus", "CS454", "Week 3");

    let preview = preview(&fixture.vault(), TEMPLATE).unwrap();

    assert_eq!(preview.moves.len(), 1);
    assert_eq!(preview.moves[0].from, "raft-consensus");
    assert_eq!(preview.moves[0].to, "cs454/week-3-raft-consensus");
    assert!(preview.blocked.is_empty());
    assert_eq!(preview.unchanged, 0);

    assert!(
        lecture_at(&fixture.vault, "raft-consensus"),
        "a preview must not move anything"
    );
    assert!(!fixture.vault.join("cs454").exists());
}

#[test]
fn applying_files_the_lecture_where_the_preview_said() {
    let fixture = Fixture::new();
    fixture.file("raft-consensus", "CS454", "Week 3");

    let result = fixture.apply();

    assert!(result.complete);
    assert!(result.stopped_by.is_none());
    assert!(result.positions_lost.is_none());
    assert_eq!(result.moved.len(), 1);
    assert_eq!(result.moved[0].to, "cs454/week-3-raft-consensus");
    assert!(lecture_at(&fixture.vault, "cs454/week-3-raft-consensus"));

    // And the vault reopens with the lecture in its new place, facets intact.
    let summary = open_vault(&fixture.vault()).unwrap();
    assert_eq!(summary.lectures.len(), 1);
    assert_eq!(summary.lectures[0].directory, "cs454/week-3-raft-consensus");
    assert_eq!(summary.lectures[0].week.as_deref(), Some("Week 3"));
}

#[test]
fn a_remembered_reading_position_follows_the_lecture() {
    // §1.4: failure must never lose work, and the page someone had open is work. `ViewState`
    // is keyed by lecture path, so without this the position is silently orphaned by a
    // tidy-up the person asked for.
    let fixture = Fixture::new();
    fixture.file("raft-consensus", "CS454", "Week 3");

    let root = VaultRoot::open(&fixture.vault).unwrap();
    let device = DeviceStateStore::under(&fixture.state, &root).unwrap();
    let was_at = RelativePath::parse("raft-consensus").unwrap();

    let mut state = ViewState::empty();
    state.remember(&was_at, LectureView::at_page(PageNumber::new(17).unwrap()));
    device.save(&state).unwrap();

    fixture.apply();

    // Re-read from disk rather than trusting the handle we just wrote through.
    let after = DeviceStateStore::under(&fixture.state, &root)
        .unwrap()
        .load();
    let now_at = RelativePath::parse("cs454/week-3-raft-consensus").unwrap();

    assert_eq!(
        after.position_in(&now_at).map(LectureView::page),
        Some(PageNumber::new(17).unwrap()),
        "the reading position did not follow the move"
    );
    assert!(
        after.position_in(&was_at).is_none(),
        "and it is not left behind at the old path as well"
    );
}

#[test]
fn a_reading_position_that_cannot_be_rewritten_does_not_hide_the_moves() {
    // §1.1: the folders have moved by the time the device state is written, so a failure
    // there must not come back as "the reorganize failed" -- the person would go looking
    // for lectures where the UI said they still were.
    let fixture = Fixture::new();
    fixture.file("raft-consensus", "CS454", "Week 3");

    let result = apply_under(&fixture.blocked_state(), &fixture.vault(), TEMPLATE)
        .expect("the moves must still be reported");

    assert!(result.complete);
    assert_eq!(result.moved.len(), 1);
    assert!(
        lecture_at(&fixture.vault, "cs454/week-3-raft-consensus"),
        "the folders really did move"
    );

    // And the loss is reported rather than swallowed, with a sentence to show for it.
    let lost = result
        .positions_lost
        .expect("the reading position was lost, and that must be said");
    assert!(lost.code.starts_with("ERR_"), "code was {}", lost.code);
    assert!(!lost.remediation.is_empty());
}

#[test]
fn a_lecture_that_cannot_be_filed_is_reported_with_something_to_do_about_it() {
    // Straight after import a lecture has no facets, and this template needs a week.
    let fixture = Fixture::new();

    let preview = preview(&fixture.vault(), TEMPLATE).unwrap();

    assert!(preview.moves.is_empty());
    assert_eq!(preview.unchanged, 0, "it is blocked, not already in place");
    assert_eq!(preview.blocked.len(), 1);
    assert_eq!(preview.blocked[0].directory, "raft-consensus");
    assert_eq!(preview.blocked[0].reason, "nameUnusable");
    assert_eq!(
        preview.blocked[0].wanted, None,
        "there is nowhere it wanted to be"
    );
    assert!(!preview.blocked[0].remediation.is_empty());
}

#[test]
fn a_lecture_already_in_place_is_counted_rather_than_moved_again() {
    let fixture = Fixture::new();
    fixture.file("raft-consensus", "CS454", "Week 3");
    fixture.apply();

    // The second run has nothing left to do, which is what makes this safe to re-run.
    let preview = preview(&fixture.vault(), TEMPLATE).unwrap();

    assert!(preview.moves.is_empty());
    assert_eq!(preview.unchanged, 1);
    assert!(preview.blocked.is_empty());
}

#[test]
fn a_template_that_is_not_usable_is_refused_before_the_vault_is_read() {
    let fixture = Fixture::new();

    // No `{title}` in the last level, so it names a folder rather than a lecture.
    let error = preview(&fixture.vault(), "{course}/{week}")
        .expect_err("a template with no title should be refused");

    assert!(error.code.starts_with("ERR_"), "code was {}", error.code);
    assert!(!error.remediation.is_empty());
}

#[test]
fn a_vault_that_is_not_there_fails_without_writing_device_state() {
    let fixture = Fixture::new();
    let missing = fixture.vault.join("no-such-vault");

    let error = apply_under(&fixture.state, &missing.display().to_string(), TEMPLATE)
        .expect_err("a missing vault should be refused");

    assert!(error.code.starts_with("ERR_"));
    assert!(
        !fixture.state.join("vaults").exists(),
        "nothing should have been written for a vault that does not exist"
    );
}
