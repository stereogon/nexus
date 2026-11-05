//! Finding words in notes and highlights: case, context, lines, and characters outside ASCII.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use lecture_core::{SNIPPET_CONTEXT, SearchQuery, Snippet};

fn query(text: &str) -> SearchQuery {
    SearchQuery::parse(text).unwrap()
}

#[test]
fn an_empty_query_is_no_query() {
    assert!(SearchQuery::parse("").is_none());
    assert!(SearchQuery::parse("   \t").is_none());
}

#[test]
fn case_is_ignored_and_the_match_keeps_its_own() {
    // The spaces beside the match are kept, so the three pieces join back into the line.
    let found = query("RAFT").snippet("Why Raft elects a leader").unwrap();

    assert_eq!(
        found,
        Snippet {
            before: "Why ".to_owned(),
            matched: "Raft".to_owned(),
            after: " elects a leader".to_owned(),
        }
    );
}

#[test]
fn surrounding_spaces_in_the_query_do_not_count() {
    assert!(query("  leader ").snippet("the leader lease").is_some());
}

#[test]
fn text_without_the_query_has_no_snippet() {
    assert!(query("paxos").snippet("Raft elects a leader").is_none());
}

#[test]
fn letters_outside_ascii_match_regardless_of_case() {
    let found = query("ÉCOLE").snippet("à l'école normale").unwrap();

    assert_eq!(found.matched, "école");
}

#[test]
fn a_letter_that_lowercases_to_two_still_marks_the_right_words() {
    // `İ` lowercases to two characters; the match must still map back to the original.
    let found = query("i̇stanbul")
        .snippet("Meet in İstanbul tomorrow")
        .unwrap();

    assert_eq!(found.before, "Meet in ");
    assert_eq!(found.matched, "İstanbul");
    assert_eq!(found.after, " tomorrow");
}

#[test]
fn emoji_before_the_match_do_not_move_it() {
    let found = query("leader").snippet("📌📌 the leader lease").unwrap();

    assert_eq!(found.matched, "leader");
    assert_eq!(found.before, "📌📌 the ");
}

#[test]
fn long_lines_are_cut_to_context_with_an_ellipsis() {
    let line = format!("{} quorum {}", "a".repeat(100), "b".repeat(100));
    let found = query("quorum").snippet(&line).unwrap();

    assert!(found.before.starts_with('…'));
    assert!(found.after.ends_with('…'));
    // "…", then the context — which ends with the space before the match.
    assert_eq!(found.before.chars().count(), SNIPPET_CONTEXT + 1);
    assert_eq!(found.matched, "quorum");
}

#[test]
fn lines_are_counted_from_one_and_limited() {
    let notes = "# Raft\n\nleader election\nno match\nthe leader lease\r\nleader again\n";
    let (found, total) = query("leader").lines(notes, 2);

    assert_eq!(total, 3);
    assert_eq!(
        found.iter().map(|hit| hit.line).collect::<Vec<_>>(),
        vec![3, 5]
    );
}
