//! The line "Link to Notes" inserts into `notes.md`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{
    Annotation, AnnotationId, CitationIndex, Excerpt, HighlightSemantic, NormalizedRect,
    PageNumber, Timestamp, citation_block,
};

const MADE: &str = "2026-11-05T10:00:00Z";

fn highlight(quote: &str) -> Annotation {
    Annotation::text_highlight(
        AnnotationId::parse("hl-9f8a7b6c").unwrap(),
        PageNumber::new(4).unwrap(),
        HighlightSemantic::Key,
        Excerpt::parse(quote).unwrap(),
        vec![NormalizedRect::new(0.1, 0.2, 0.5, 0.03).unwrap()],
        Timestamp::parse(MADE).unwrap(),
    )
    .unwrap()
}

fn area(caption: Option<&str>) -> Annotation {
    Annotation::area_highlight(
        AnnotationId::parse("ar-1").unwrap(),
        PageNumber::new(7).unwrap(),
        HighlightSemantic::Definition,
        NormalizedRect::new(0.1, 0.3, 0.5, 0.4).unwrap(),
        caption.map(|text| Excerpt::parse(text).unwrap()),
        Timestamp::parse(MADE).unwrap(),
    )
}

#[test]
fn a_highlight_becomes_the_line_the_spec_describes() {
    assert_eq!(
        citation_block(&highlight("Raft achieves consensus via an elected leader.")),
        r#"> 📌 **[Page 4](cite://hl-9f8a7b6c)**: *"Raft achieves consensus via an elected leader."*"#
    );
}

#[test]
fn an_area_with_no_caption_is_the_link_alone() {
    // A box drawn round a diagram has no text to quote, and an empty pair of quotation
    // marks would read as a highlight of nothing.
    assert_eq!(
        citation_block(&area(None)),
        "> 📌 **[Page 7](cite://ar-1)**"
    );
}

#[test]
fn an_area_with_a_caption_quotes_it() {
    assert_eq!(
        citation_block(&area(Some("The Raft state machine"))),
        r#"> 📌 **[Page 7](cite://ar-1)**: *"The Raft state machine"*"#
    );
}

#[test]
fn a_text_box_quotes_what_was_typed() {
    let typed = Annotation::text_box(
        AnnotationId::parse("tb-1").unwrap(),
        PageNumber::new(2).unwrap(),
        NormalizedRect::new(0.2, 0.2, 0.3, 0.1).unwrap(),
        Excerpt::parse("Important exam formula").unwrap(),
        Timestamp::parse(MADE).unwrap(),
    );

    assert_eq!(
        citation_block(&typed),
        r#"> 📌 **[Page 2](cite://tb-1)**: *"Important exam formula"*"#
    );
}

#[test]
fn markdown_in_the_quote_cannot_break_the_line() {
    // An asterisk would end the emphasis early, a backtick open a code span, a bracket
    // start a link of its own -- all ordinary in lecture text about code or maths.
    let block = citation_block(&highlight(r"a*b, snake_case, `x`, [1] and C:\path"));

    assert_eq!(
        block,
        r#"> 📌 **[Page 4](cite://hl-9f8a7b6c)**: *"a\*b, snake\_case, \`x\`, \[1\] and C:\\path"*"#
    );
}

#[test]
fn the_scanner_finds_the_inserted_line_again() {
    // The point of the line: clicking it later has to lead back to this highlight, so the
    // index that drives that must see exactly one citation, of this id.
    let notes = format!(
        "# Week 2\n\nSome prose.\n\n{}\n",
        citation_block(&highlight("Raft *uses* a [leader]."))
    );
    let index = CitationIndex::scan(&notes);

    assert_eq!(index.len(), 1);
    assert_eq!(index.all().first().unwrap().id().as_str(), "hl-9f8a7b6c");
    assert_eq!(
        index.first_line_of(&AnnotationId::parse("hl-9f8a7b6c").unwrap()),
        Some(5)
    );
}
