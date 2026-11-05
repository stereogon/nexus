//! Contract tests for `search_vault` and `vault_highlights`, against real temporary vaults.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use std::fs;

use lecture_core::{FixedClock, HighlightSemantic, RelativePath, SequentialIds, Timestamp};
use lecture_fs::{AtomicFsStorage, VaultRoot};
use nexus_app::annotations::{NewHighlight, write_highlight};
use nexus_app::search::{MAX_RESULTS, NOTE_LINES_PER_LECTURE, find_in_vault, marks_in_vault};
use tempfile::TempDir;

const RAFT: &str = "cs454/raft";
const PAXOS: &str = "cs454/paxos";

fn lectures() -> Vec<String> {
    vec![RAFT.to_owned(), PAXOS.to_owned()]
}

/// Two lectures: Raft with notes and a highlight, Paxos with notes only.
fn vault() -> TempDir {
    let dir = TempDir::new().unwrap();
    let storage = AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap());

    for bundle in [RAFT, PAXOS] {
        storage
            .create_dir(&RelativePath::parse(bundle).unwrap())
            .unwrap();
    }

    fs::write(
        dir.path().join(RAFT).join("notes.md"),
        "# Raft\n\nA leader is elected by majority.\nTerms only grow.\n",
    )
    .unwrap();
    fs::write(
        dir.path().join(PAXOS).join("notes.md"),
        "Paxos has no stable leader.\n",
    )
    .unwrap();

    write_highlight(
        dir.path().to_str().unwrap(),
        RAFT,
        NewHighlight {
            page: 3,
            semantic: HighlightSemantic::Exam,
            quote: "The Leader Completeness property".to_owned(),
            rects: vec![
                serde_json::from_str(r#"{"x":0.1,"y":0.2,"width":0.5,"height":0.03}"#).unwrap(),
            ],
        },
        &SequentialIds::new("hl-"),
        &FixedClock::new(Timestamp::parse("2026-11-05T09:00:00Z").unwrap()),
    )
    .unwrap();

    dir
}

fn root(dir: &TempDir) -> &str {
    dir.path().to_str().unwrap()
}

#[test]
fn notes_and_highlights_are_both_searched_ignoring_case() {
    let dir = vault();
    let found = find_in_vault(root(&dir), &lectures(), "LEADER").unwrap();

    assert_eq!(found.lectures.len(), 2);

    let raft = &found.lectures[0];
    assert_eq!(raft.directory, RAFT);
    assert_eq!(raft.notes[0].line, 3);
    assert_eq!(raft.notes[0].snippet.matched, "leader");
    assert_eq!(raft.marks[0].page, 3);
    assert_eq!(raft.marks[0].semantic, Some(HighlightSemantic::Exam));
    assert_eq!(raft.marks[0].snippet.matched, "Leader");

    assert_eq!(found.lectures[1].directory, PAXOS);
    assert_eq!(found.unreadable, 0);
}

#[test]
fn a_lecture_with_no_match_is_left_out() {
    let dir = vault();
    let found = find_in_vault(root(&dir), &lectures(), "terms").unwrap();

    assert_eq!(found.lectures.len(), 1);
    assert_eq!(found.lectures[0].directory, RAFT);
}

#[test]
fn an_empty_query_finds_nothing_and_reads_nothing() {
    let dir = vault();

    assert!(
        find_in_vault(root(&dir), &lectures(), "  ")
            .unwrap()
            .lectures
            .is_empty()
    );
}

#[test]
fn a_damaged_lecture_is_counted_and_the_rest_still_searched() {
    let dir = vault();
    fs::write(
        dir.path().join(PAXOS).join("annotations.json"),
        "{ not json",
    )
    .unwrap();

    let found = find_in_vault(root(&dir), &lectures(), "leader").unwrap();

    assert_eq!(found.unreadable, 1);
    assert_eq!(found.lectures.len(), 1);
    assert_eq!(found.lectures[0].directory, RAFT);
}

#[test]
fn many_matching_lines_are_listed_up_to_a_limit_and_counted() {
    let dir = vault();
    fs::write(
        dir.path().join(PAXOS).join("notes.md"),
        "leader\n".repeat(10),
    )
    .unwrap();

    let found = find_in_vault(root(&dir), &[PAXOS.to_owned()], "leader").unwrap();

    assert_eq!(found.lectures[0].notes.len(), NOTE_LINES_PER_LECTURE);
    assert_eq!(found.lectures[0].note_lines, 10);
}

#[test]
fn a_huge_vault_stops_at_the_result_limit_and_says_so() {
    let dir = vault();
    let storage = AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap());
    let many: Vec<String> = (0..MAX_RESULTS).map(|n| format!("bulk/l{n}")).collect();

    for bundle in &many {
        storage
            .create_dir(&RelativePath::parse(bundle).unwrap())
            .unwrap();
        fs::write(dir.path().join(bundle).join("notes.md"), "leader\nleader\n").unwrap();
    }

    let found = find_in_vault(root(&dir), &many, "leader").unwrap();

    assert!(found.truncated);
    assert!(found.lectures.len() < many.len());
}

#[test]
fn a_directory_outside_the_vault_is_refused() {
    let dir = vault();

    assert!(find_in_vault(root(&dir), &["../elsewhere".to_owned()], "leader").is_err());
    assert!(marks_in_vault(root(&dir), &["../elsewhere".to_owned()]).is_err());
}

#[test]
fn every_highlight_is_listed_by_lecture_and_lectures_without_any_are_left_out() {
    let dir = vault();
    let found = marks_in_vault(root(&dir), &lectures()).unwrap();

    assert_eq!(found.lectures.len(), 1);
    assert_eq!(found.lectures[0].directory, RAFT);
    assert_eq!(found.lectures[0].annotations.len(), 1);
    assert_eq!(found.unreadable, 0);
}

#[test]
fn a_damaged_annotations_file_is_counted_in_the_library() {
    let dir = vault();
    fs::write(
        dir.path().join(PAXOS).join("annotations.json"),
        "{ not json",
    )
    .unwrap();

    let found = marks_in_vault(root(&dir), &lectures()).unwrap();

    assert_eq!(found.unreadable, 1);
    assert_eq!(found.lectures.len(), 1);
}
