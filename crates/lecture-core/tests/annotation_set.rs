//! Contract tests for [`AnnotationSet`] — the whole of one `annotations.json`.
//!
//! The cases here are the ones a hand-edited file could produce, since this is plain
//! JSON in a folder people browse. Tests for a single annotation live in
//! `annotation.rs`.

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
