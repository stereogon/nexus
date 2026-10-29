//! Contract tests for a single [`Annotation`].
//!
//! The coordinate rule is the one that matters most: these rectangles are what make a
//! highlight land in the same place on a laptop, a 4K display and an iPad, and a
//! regression there would be invisible until someone opened their notes on another
//! screen.
//!
//! Tests for the collection live in `annotation_set.rs`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{
    Annotation, AnnotationId, CoreError, Excerpt, HighlightSemantic, NormalizedRect, PageNumber,
    Timestamp,
};

const MADE: &str = "2026-10-27T16:00:00Z";

fn id(raw: &str) -> AnnotationId {
    AnnotationId::parse(raw).unwrap()
}

fn page(number: u32) -> PageNumber {
    PageNumber::new(number).unwrap()
}

fn quote(raw: &str) -> Excerpt {
    Excerpt::parse(raw).unwrap()
}

fn rect(x: f64, y: f64, w: f64, h: f64) -> NormalizedRect {
    NormalizedRect::new(x, y, w, h).unwrap()
}

fn at(raw: &str) -> Timestamp {
    Timestamp::parse(raw).unwrap()
}

/// Compares a *computed* coordinate.
///
/// Exact equality is right for a value that was stored and read back, and wrong for one
/// that came out of arithmetic: `0.28 + 0.03` is `0.31000000000000005` in binary
/// floating point. The tolerance is far tighter than a pixel on any display, so it
/// cannot hide a real positioning error.
fn assert_close(actual: f64, expected: f64, what: &str) {
    const TOLERANCE: f64 = 1e-9;

    assert!(
        (actual - expected).abs() < TOLERANCE,
        "{what}: expected {expected}, got {actual}"
    );
}

fn highlight(ident: &str, number: u32) -> Annotation {
    Annotation::text_highlight(
        id(ident),
        page(number),
        HighlightSemantic::Key,
        quote("Raft achieves consensus via an elected leader."),
        vec![rect(0.142, 0.285, 0.612, 0.032)],
        at(MADE),
    )
    .unwrap()
}

#[test]
fn describes_a_text_highlight() {
    let annotation = highlight("hl-9f8a7b6c", 4);

    assert_eq!(annotation.id().as_str(), "hl-9f8a7b6c");
    assert_eq!(annotation.page().get(), 4);
    assert_eq!(annotation.semantic(), Some(HighlightSemantic::Key));
    assert_eq!(annotation.created_at(), annotation.updated_at());
}

#[test]
fn a_text_highlight_must_cover_something() {
    // A highlight over no rectangles could never be drawn, nor linked to.
    let err = Annotation::text_highlight(
        id("hl-empty"),
        page(1),
        HighlightSemantic::Key,
        quote("nothing"),
        Vec::new(),
        at(MADE),
    )
    .unwrap_err();

    assert!(matches!(err, CoreError::InvalidAnnotation { .. }));
    assert_eq!(err.code(), "ERR_INVALID_ANNOTATION");
}

/// The derived-not-stored decision.
#[test]
fn the_bounding_box_is_the_union_of_the_line_rectangles() {
    // A selection spanning three lines. The box a deep link centres on must cover all of
    // them, and is computed rather than stored so the two cannot disagree.
    let annotation = Annotation::text_highlight(
        id("hl-multiline"),
        page(2),
        HighlightSemantic::Exam,
        quote("A sentence that wraps across three lines of the slide."),
        vec![
            rect(0.30, 0.20, 0.50, 0.03),
            rect(0.10, 0.24, 0.70, 0.03),
            rect(0.10, 0.28, 0.25, 0.03),
        ],
        at(MADE),
    )
    .unwrap();

    let bounds = annotation.bounding_rect().unwrap();

    assert_close(bounds.x(), 0.10, "left edge");
    assert_close(bounds.y(), 0.20, "top edge");
    assert_close(bounds.right(), 0.80, "right edge");
    assert_close(bounds.bottom(), 0.31, "bottom edge");
}

#[test]
fn an_area_highlight_bounds_itself() {
    let region = rect(0.2, 0.3, 0.4, 0.25);
    let annotation = Annotation::area_highlight(
        id("ar-diagram"),
        page(7),
        HighlightSemantic::Definition,
        region,
        Some(quote("The leader election state machine")),
        at(MADE),
    );

    assert_eq!(annotation.bounding_rect().unwrap(), region);
    assert_eq!(
        annotation.text().unwrap().as_str(),
        "The leader election state machine"
    );
}

#[test]
fn an_area_highlight_need_not_have_a_caption() {
    // A diagram has no text to quote, so the caption is genuinely optional.
    let annotation = Annotation::area_highlight(
        id("ar-plain"),
        page(1),
        HighlightSemantic::Question,
        rect(0.1, 0.1, 0.2, 0.2),
        None,
        at(MADE),
    );

    assert!(annotation.text().is_none());
}

#[test]
fn a_text_box_carries_typed_text_and_no_semantic() {
    let annotation = Annotation::text_box(
        id("tb-note"),
        page(3),
        rect(0.5, 0.5, 0.3, 0.1),
        quote("Ask about the 2-phase commit comparison"),
        at(MADE),
    );

    assert_eq!(annotation.semantic(), None, "a text box marks nothing");
    assert_eq!(
        annotation.text().unwrap().as_str(),
        "Ask about the 2-phase commit comparison"
    );
}

#[test]
fn every_semantic_has_a_distinct_glyph() {
    // Required so the four can be told apart without relying on hue -- it is the
    // accessibility guarantee, not decoration.
    let glyphs: Vec<char> = HighlightSemantic::all().iter().map(|s| s.glyph()).collect();

    assert_eq!(glyphs, ['K', 'D', 'E', 'Q']);

    let mut unique = glyphs.clone();
    unique.sort_unstable();
    unique.dedup();
    assert_eq!(unique.len(), glyphs.len(), "glyphs must be distinct");
}

#[test]
fn pages_are_numbered_from_one() {
    // An off-by-one here is invisible: every highlight simply renders on the wrong page.
    assert_eq!(PageNumber::first().get(), 1);
    assert_eq!(page(1).zero_based_index(), 0);
    assert_eq!(page(4).zero_based_index(), 3);

    let err = PageNumber::new(0).unwrap_err();
    assert_eq!(err.code(), "ERR_INVALID_PAGE_NUMBER");
}

#[test]
fn an_identifier_is_safe_inside_a_citation_link() {
    // The id is written into notes.md as cite://<id>, so it must need no escaping.
    for raw in ["hl-9f8a7b6c", "ar_diagram_2", "abc123", "A-B_c"] {
        assert!(AnnotationId::parse(raw).is_ok(), "`{raw}` should be valid");
    }

    for raw in ["", "hl 9f8a", "hl/9f8a", "hl?9f8a", "hl#9f8a", "héllo"] {
        assert!(
            AnnotationId::parse(raw).is_err(),
            "`{raw}` would not survive a URL and must be refused"
        );
    }
}

#[test]
fn an_excerpt_tidies_text_pulled_out_of_a_pdf() {
    // PDF extraction breaks lines wherever the typesetting wrapped, which means nothing.
    let extracted = Excerpt::parse("Raft  achieves\nconsensus   via\tan elected leader.").unwrap();

    assert_eq!(
        extracted.as_str(),
        "Raft achieves consensus via an elected leader."
    );
}

#[test]
fn an_excerpt_can_hold_a_whole_paragraph() {
    // Refusing a generous highlight would lose someone's work.
    assert!(Excerpt::parse(&"word ".repeat(600)).is_ok());
    assert!(Excerpt::parse(&"a".repeat(4_001)).is_err());
    assert!(Excerpt::parse("").is_err());
}

#[test]
fn quoted_text_keeps_its_words_when_the_pdf_hides_characters_in_it() {
    // Reported 2026-10-29: highlighting a formula reading "R cap" failed outright. Text
    // extracted from a PDF carries soft hyphens, zero-width joiners and the rest as a
    // matter of course -- the reader did not put them there and cannot take them out, so
    // refusing the highlight loses work for a reason nobody can act on (§1.4).
    let hidden = "R\u{00AD} cap\u{200B} is the estimate\u{FEFF}";

    assert_eq!(
        Excerpt::parse(hidden).unwrap().as_str(),
        "R cap is the estimate"
    );
}

#[test]
fn quoted_text_drops_a_control_character_rather_than_refusing_the_highlight() {
    let stray = "Raft\u{0000} achieves\u{001B} consensus";

    assert_eq!(
        Excerpt::parse(stray).unwrap().as_str(),
        "Raft achieves consensus"
    );
}

#[test]
fn a_direction_override_cannot_survive_into_a_stored_quote() {
    // Stripping is not a weakening of the rule it replaced. The override is gone from the
    // stored text, so it cannot reorder anything wherever the quote is later shown -- the
    // difference is only that the highlight survives.
    let spoofed = "total\u{202E}gnp\u{202C} rises";
    let stored = Excerpt::parse(spoofed).unwrap();

    assert!(!stored.as_str().contains('\u{202E}'));
    assert!(!stored.as_str().contains('\u{202C}'));
    assert_eq!(stored.as_str(), "totalgnp rises");
}

#[test]
fn a_selection_of_nothing_but_hidden_characters_is_still_refused() {
    // Stripping cannot rescue a selection that had no words in it -- which is what
    // dragging across a diagram or a scanned page produces.
    let nothing = Excerpt::parse("\u{200B}\u{FEFF}  \u{00AD}");

    assert!(nothing.is_err());
}

#[test]
fn the_refusal_talks_about_the_highlight_and_not_about_a_folder() {
    // The actual defect reported: ERR_INVALID_NAME, remediated with "try a shorter name,
    // or one without punctuation such as slashes or colons". A person highlighting a
    // formula cannot act on that at all.
    let refused = Excerpt::parse("").unwrap_err();

    assert_eq!(refused.code(), "ERR_INVALID_EXCERPT");
    assert!(refused.remediation().contains("selection"));
    assert!(!refused.remediation().contains("folder"));
}

#[test]
fn a_quote_that_is_too_long_is_measured_after_the_hidden_characters_go() {
    // Otherwise a paragraph padded with zero-width characters could be refused for a
    // length it does not actually have once stored.
    let padded = format!("{}{}", "a".repeat(3_999), "\u{200B}".repeat(500));

    assert!(Excerpt::parse(&padded).is_ok());
}
