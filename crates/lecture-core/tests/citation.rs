//! Contract tests for scanning `cite://<id>` out of Markdown prose.
//!
//! The link between the document and the notes is the one thing in a bundle that a
//! person *typed*. The cases that matter most are the ones where a wrong answer would
//! send someone to the wrong place in their own writing — or quietly edit it.
//!
//! Resolution against an annotation set lives in `citation_linking.rs`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{AnnotationId, CitationIndex};

fn id(raw: &str) -> AnnotationId {
    AnnotationId::parse(raw).unwrap()
}

/// The exact form the spec writes into `notes.md`.
#[test]
fn finds_a_citation_in_the_spec_s_own_template() {
    let notes = "Some prose.\n\n\
                 > 📌 **[Slide/Page 4](cite://hl-9f8a7b6c)**: *\"Raft elects a leader.\"*\n\n\
                 More prose.\n";

    let index = CitationIndex::scan(notes);

    assert_eq!(index.len(), 1);
    let citation = index.all().first().unwrap();
    assert_eq!(citation.id().as_str(), "hl-9f8a7b6c");
    assert_eq!(citation.line(), 3);
}

/// The case that would break every citation if the terminator were wrong.
#[test]
fn a_markdown_link_s_closing_parenthesis_terminates_the_identifier() {
    let index = CitationIndex::scan("[here](cite://hl-abc123)\n");

    assert_eq!(index.len(), 1);
    assert_eq!(
        index.all().first().unwrap().id().as_str(),
        "hl-abc123",
        "the `)` must not be swallowed into the identifier"
    );
}

#[test]
fn identifiers_end_at_any_character_they_cannot_contain() {
    let cases = [
        ("cite://hl-abc)", "hl-abc"),
        ("cite://hl-abc ", "hl-abc"),
        ("cite://hl-abc.", "hl-abc"),
        ("cite://hl-abc\"", "hl-abc"),
        ("see cite://hl-abc, then", "hl-abc"),
        ("cite://hl_abc-1", "hl_abc-1"),
    ];

    for (notes, expected) in cases {
        let index = CitationIndex::scan(notes);
        assert_eq!(
            index.all().first().map(|c| c.id().as_str()),
            Some(expected),
            "scanning `{notes}`"
        );
    }
}

#[test]
fn lines_are_numbered_from_one_as_an_editor_numbers_them() {
    let notes = "line one\ncite://hl-a\nline three\ncite://hl-b\n";

    let index = CitationIndex::scan(notes);

    assert_eq!(index.all().first().unwrap().line(), 2);
    assert_eq!(index.all().first().unwrap().zero_based_line_index(), 1);
    assert_eq!(index.all().get(1).unwrap().line(), 4);
}

#[test]
fn an_emoji_earlier_in_the_file_does_not_shift_the_line_number() {
    // The reason only lines are reported: Rust bytes, Unicode scalars and UTF-16 units
    // are three different numbers, and the spec's own template contains an emoji.
    let notes = "📌 📌 📌 heading\ncite://hl-a\n";

    let index = CitationIndex::scan(notes);

    assert_eq!(index.all().first().unwrap().line(), 2);
}

#[test]
fn counts_the_same_identifier_cited_on_several_lines() {
    // Citing one highlight twice is legitimate, so both occurrences are kept.
    let notes = "cite://hl-a first mention\nsomething else\ncite://hl-a again\n";

    let index = CitationIndex::scan(notes);

    assert_eq!(index.len(), 2);
    assert_eq!(index.cited_ids().len(), 1);
    assert_eq!(index.citations_of(&id("hl-a")).count(), 2);
    assert_eq!(index.first_line_of(&id("hl-a")), Some(1));
}

#[test]
fn finds_several_citations_on_one_line() {
    let index = CitationIndex::scan("[a](cite://hl-a) and [b](cite://hl-b)\n");

    assert_eq!(index.len(), 2);
    assert_eq!(
        index
            .all()
            .iter()
            .map(|c| c.id().as_str())
            .collect::<Vec<_>>(),
        ["hl-a", "hl-b"]
    );
}

/// The reason the scanner is not a regex over the whole file.
#[test]
fn a_citation_inside_a_fenced_code_block_is_an_example_not_a_link() {
    let notes = "Real: cite://hl-real\n\
                 \n\
                 ```markdown\n\
                 [example](cite://hl-fake)\n\
                 ```\n\
                 \n\
                 Also real: cite://hl-other\n";

    let index = CitationIndex::scan(notes);

    let found: Vec<&str> = index.all().iter().map(|c| c.id().as_str()).collect();
    assert_eq!(
        found,
        ["hl-real", "hl-other"],
        "a citation in a code fence must not be treated as live"
    );
}

#[test]
fn handles_tilde_fences_and_longer_fences() {
    let notes = "~~~\ncite://hl-in-tilde\n~~~\n\
                 ````\ncite://hl-in-long\n````\n\
                 cite://hl-outside\n";

    let index = CitationIndex::scan(notes);

    let found: Vec<&str> = index.all().iter().map(|c| c.id().as_str()).collect();
    assert_eq!(found, ["hl-outside"]);
}

#[test]
fn a_shorter_run_does_not_close_a_longer_fence() {
    // ``` inside a ```` block is content, so the block stays open.
    let notes = "````\n```\ncite://hl-still-inside\n````\ncite://hl-outside\n";

    let index = CitationIndex::scan(notes);

    let found: Vec<&str> = index.all().iter().map(|c| c.id().as_str()).collect();
    assert_eq!(found, ["hl-outside"]);
}

#[test]
fn a_citation_inside_an_inline_code_span_is_not_a_link() {
    let notes = "Write `cite://hl-fake` to link, like [this](cite://hl-real).\n";

    let index = CitationIndex::scan(notes);

    let found: Vec<&str> = index.all().iter().map(|c| c.id().as_str()).collect();
    assert_eq!(found, ["hl-real"]);
}

#[test]
fn unterminated_backticks_do_not_swallow_the_rest_of_the_line() {
    // A stray backtick is literal text, so citations after it are still found. Getting
    // this wrong would make one typo silently unlink the rest of someone's line.
    let notes = "A stray ` backtick then [a](cite://hl-real)\n";

    let index = CitationIndex::scan(notes);

    let found: Vec<&str> = index.all().iter().map(|c| c.id().as_str()).collect();
    assert_eq!(found, ["hl-real"]);
}

#[test]
fn a_double_backtick_span_closes_only_on_a_double_backtick() {
    let notes = "``code with ` inside and cite://hl-fake`` then cite://hl-real\n";

    let index = CitationIndex::scan(notes);

    let found: Vec<&str> = index.all().iter().map(|c| c.id().as_str()).collect();
    assert_eq!(found, ["hl-real"]);
}

#[test]
fn skips_occurrences_that_could_never_name_an_annotation() {
    for notes in [
        "cite://\n",
        "cite:// hl-a\n",
        "cite://)\n",
        &format!("cite://{}\n", "a".repeat(65)),
    ] {
        let index = CitationIndex::scan(notes);
        assert!(
            index.is_empty(),
            "`{}` cannot name an annotation and must be skipped",
            notes.escape_debug()
        );
    }
}

#[test]
fn ignores_prose_that_merely_mentions_the_scheme() {
    let index = CitationIndex::scan("The scheme is written in lowercase: Cite://hl-a\n");

    assert!(
        index.is_empty(),
        "the scheme is matched case-sensitively, so a typo is not a citation"
    );
}

#[test]
fn handles_windows_line_endings() {
    let notes = "line one\r\ncite://hl-a\r\nline three\r\n";

    let index = CitationIndex::scan(notes);

    assert_eq!(index.len(), 1);
    assert_eq!(index.all().first().unwrap().line(), 2);
    assert_eq!(
        index.all().first().unwrap().id().as_str(),
        "hl-a",
        "a trailing carriage return must not become part of the identifier"
    );
}

#[test]
fn an_empty_notes_file_cites_nothing() {
    assert!(CitationIndex::scan("").is_empty());
    assert!(CitationIndex::scan("\n\n\n").is_empty());
}
