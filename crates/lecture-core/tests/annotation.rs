//! Contract tests for [`Annotation`] and [`AnnotationSet`].
//!
//! The coordinate rule is the one that matters most: these rectangles are what make a
//! highlight land in the same place on a laptop, a 4K display and an iPad, and a
//! regression there would be invisible until someone opened their notes on another
//! screen.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{
    ANNOTATIONS_SCHEMA_VERSION, Annotation, AnnotationId, AnnotationSet, CoreError, Excerpt,
    HighlightSemantic, NormalizedRect, PageNumber, Timestamp,
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
fn a_set_starts_empty_and_accepts_annotations() {
    let mut set = AnnotationSet::empty();
    assert!(set.is_empty());

    set.insert(highlight("hl-one", 1)).unwrap();
    set.insert(highlight("hl-two", 2)).unwrap();

    assert_eq!(set.len(), 2);
    assert_eq!(set.get(&id("hl-one")).unwrap().page().get(), 1);
}

#[test]
fn two_annotations_cannot_share_an_identifier() {
    // A cite:// link that resolves to two places has no right answer.
    let mut set = AnnotationSet::empty();
    set.insert(highlight("hl-same", 1)).unwrap();

    let err = set.insert(highlight("hl-same", 5)).unwrap_err();

    assert!(matches!(err, CoreError::DuplicateAnnotationId { .. }));
    assert_eq!(err.code(), "ERR_DUPLICATE_ANNOTATION_ID");
    assert_eq!(set.len(), 1, "the rejected one must not have been stored");
}

#[test]
fn removing_something_already_gone_is_not_an_error() {
    let mut set = AnnotationSet::empty();
    set.insert(highlight("hl-one", 1)).unwrap();

    assert!(set.remove(&id("hl-one")).is_some());
    assert!(
        set.remove(&id("hl-one")).is_none(),
        "already the outcome wanted"
    );
}

#[test]
fn finds_the_annotations_on_one_page() {
    let mut set = AnnotationSet::empty();
    set.insert(highlight("hl-a", 1)).unwrap();
    set.insert(highlight("hl-b", 4)).unwrap();
    set.insert(highlight("hl-c", 4)).unwrap();

    let on_four: Vec<&str> = set.on_page(page(4)).map(|a| a.id().as_str()).collect();
    assert_eq!(on_four, ["hl-b", "hl-c"]);
}

#[test]
fn the_same_annotations_always_serialise_to_the_same_bytes() {
    // A save that changed nothing must not look like a change to a sync client.
    let mut inserted_one_way = AnnotationSet::empty();
    inserted_one_way.insert(highlight("hl-c", 4)).unwrap();
    inserted_one_way.insert(highlight("hl-a", 1)).unwrap();
    inserted_one_way.insert(highlight("hl-b", 4)).unwrap();

    let mut inserted_another_way = AnnotationSet::empty();
    inserted_another_way.insert(highlight("hl-a", 1)).unwrap();
    inserted_another_way.insert(highlight("hl-b", 4)).unwrap();
    inserted_another_way.insert(highlight("hl-c", 4)).unwrap();

    assert_eq!(
        serde_json::to_string(&inserted_one_way).unwrap(),
        serde_json::to_string(&inserted_another_way).unwrap()
    );
}

#[test]
fn serialises_the_shape_the_schema_describes() {
    let mut set = AnnotationSet::empty();
    set.insert(highlight("hl-9f8a7b6c", 4)).unwrap();

    let json = serde_json::to_string_pretty(&set).unwrap();

    assert!(json.contains(r#""schemaVersion": 1"#), "got: {json}");
    assert!(json.contains(r#""kind": "textHighlight""#));
    assert!(json.contains(r#""page": 4"#));
    assert!(json.contains(r#""semantic": "key""#));
    // The meaning is stored, not the colour.
    assert!(
        !json.contains("color"),
        "no colour should be stored: {json}"
    );
    assert!(!json.contains('#'), "no hex should be stored: {json}");
    // The bounding box is derived, so it is not in the file either.
    assert!(!json.contains("boundingRect"), "should be derived: {json}");
}

#[test]
fn survives_a_json_round_trip() {
    let mut set = AnnotationSet::empty();
    set.insert(highlight("hl-one", 1)).unwrap();
    set.insert(Annotation::area_highlight(
        id("ar-two"),
        page(3),
        HighlightSemantic::Exam,
        rect(0.2, 0.2, 0.3, 0.3),
        Some(quote("A diagram")),
        at(MADE),
    ))
    .unwrap();
    set.insert(Annotation::text_box(
        id("tb-three"),
        page(5),
        rect(0.1, 0.1, 0.2, 0.1),
        quote("Follow up"),
        at(MADE),
    ))
    .unwrap();

    let json = serde_json::to_string(&set).unwrap();
    let parsed: AnnotationSet = serde_json::from_str(&json).unwrap();

    assert_eq!(set, parsed);
}

#[test]
fn reads_a_freshly_created_empty_file() {
    let parsed: AnnotationSet =
        serde_json::from_str(r#"{"schemaVersion":1,"annotations":[]}"#).unwrap();

    assert!(parsed.is_empty());
}

#[test]
fn refuses_annotations_from_another_schema_version() {
    let parsed = serde_json::from_str::<AnnotationSet>(r#"{"schemaVersion":2,"annotations":[]}"#);
    assert!(parsed.is_err());
    assert_eq!(ANNOTATIONS_SCHEMA_VERSION, 1);
}

#[test]
fn deserialization_cannot_bypass_validation() {
    // Each of these is a file somebody could hand-edit into existence.
    let bad = [
        // A text highlight covering nothing.
        r#"{"schemaVersion":1,"annotations":[{"kind":"textHighlight","id":"hl-a","page":1,"semantic":"key","quote":"q","rects":[],"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}]}"#,
        // Page zero.
        r#"{"schemaVersion":1,"annotations":[{"kind":"textHighlight","id":"hl-a","page":0,"semantic":"key","quote":"q","rects":[{"x":0.1,"y":0.1,"width":0.1,"height":0.1}],"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}]}"#,
        // A rectangle running off the page.
        r#"{"schemaVersion":1,"annotations":[{"kind":"textHighlight","id":"hl-a","page":1,"semantic":"key","quote":"q","rects":[{"x":0.9,"y":0.1,"width":0.5,"height":0.1}],"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}]}"#,
        // Changed before it was made.
        r#"{"schemaVersion":1,"annotations":[{"kind":"textHighlight","id":"hl-a","page":1,"semantic":"key","quote":"q","rects":[{"x":0.1,"y":0.1,"width":0.1,"height":0.1}],"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2020-01-01T00:00:00Z"}]}"#,
        // Two annotations sharing an id.
        r#"{"schemaVersion":1,"annotations":[{"kind":"textHighlight","id":"hl-a","page":1,"semantic":"key","quote":"q","rects":[{"x":0.1,"y":0.1,"width":0.1,"height":0.1}],"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"},{"kind":"textHighlight","id":"hl-a","page":2,"semantic":"key","quote":"q","rects":[{"x":0.1,"y":0.1,"width":0.1,"height":0.1}],"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}]}"#,
        // An unknown semantic.
        r#"{"schemaVersion":1,"annotations":[{"kind":"textHighlight","id":"hl-a","page":1,"semantic":"purple","quote":"q","rects":[{"x":0.1,"y":0.1,"width":0.1,"height":0.1}],"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}]}"#,
        // A text highlight carrying a text box's field, which the tagged shape forbids.
        r#"{"schemaVersion":1,"annotations":[{"kind":"textHighlight","id":"hl-a","page":1,"semantic":"key","quote":"q","rects":[{"x":0.1,"y":0.1,"width":0.1,"height":0.1}],"freeText":"stray","createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}]}"#,
    ];

    for json in bad {
        let parsed = serde_json::from_str::<AnnotationSet>(json);
        assert!(parsed.is_err(), "must be refused on read: {json}");
    }
}
