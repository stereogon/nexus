//! Contract tests for [`ViewState`], the per-device reading position.
//!
//! The behaviour worth pinning: a position restores to the same place, an unusable stored
//! value is refused at the boundary rather than restoring someone to a nonsense view, and
//! pruning against a scan keeps the file from growing forever as lectures come and go.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{
    Conversion, Label, LectureBundle, LectureView, MAX_ZOOM, MIN_ZOOM, Manifest, OrderKey,
    PageNumber, PageOffset, RelativePath, Source, Timestamp, VIEW_STATE_SCHEMA_VERSION, ViewState,
    Zoom,
};

fn path(raw: &str) -> RelativePath {
    RelativePath::parse(raw).unwrap()
}

fn page(number: u32) -> PageNumber {
    PageNumber::new(number).unwrap()
}

fn bundle(directory: &str) -> LectureBundle {
    let source = Source::new(
        path("source/document.pdf"),
        None,
        Conversion::not_required(),
    )
    .unwrap();

    LectureBundle::new(
        path(directory),
        Manifest::new(
            Label::parse("A Lecture").unwrap(),
            OrderKey::first(),
            source,
            Timestamp::parse("2026-10-27T16:00:00Z").unwrap(),
        ),
    )
}

fn references(directories: &[&str]) -> Vec<lecture_core::BundleRef> {
    directories.iter().map(|d| bundle(d).reference()).collect()
}

#[test]
fn a_new_device_remembers_nothing() {
    let state = ViewState::empty();

    assert!(state.is_empty());
    assert_eq!(state.position_in(&path("cs454/raft")), None);
    assert_eq!(state.last_opened(), None);
}

#[test]
fn remembers_where_the_viewer_was() {
    let mut state = ViewState::empty();
    let lecture = path("cs454/raft");
    let view = LectureView::new(
        page(40),
        PageOffset::new(0.25).unwrap(),
        Zoom::new(1.5).unwrap(),
    );

    state.remember(&lecture, view);

    let restored = state.position_in(&lecture).unwrap();
    assert_eq!(restored.page().get(), 40);
    assert!((restored.offset().fraction() - 0.25).abs() < f64::EPSILON);
    assert!((restored.zoom().factor() - 1.5).abs() < f64::EPSILON);
    assert_eq!(state.last_opened(), Some(&lecture));
}

#[test]
fn opening_a_second_lecture_keeps_the_place_in_the_first() {
    // Switching between two lectures must not cost your place in either.
    let mut state = ViewState::empty();
    state.remember(&path("cs454/raft"), LectureView::at_page(page(12)));
    state.remember(&path("cs454/paxos"), LectureView::at_page(page(3)));

    assert_eq!(
        state.position_in(&path("cs454/raft")).unwrap().page().get(),
        12
    );
    assert_eq!(state.last_opened(), Some(&path("cs454/paxos")));
    assert_eq!(state.len(), 2);
}

#[test]
fn survives_a_json_round_trip() {
    let mut state = ViewState::empty();
    state.remember(
        &path("cs454/raft"),
        LectureView::new(
            page(7),
            PageOffset::new(0.5).unwrap(),
            Zoom::new(2.0).unwrap(),
        ),
    );

    let json = serde_json::to_string(&state).unwrap();
    let back: ViewState = serde_json::from_str(&json).unwrap();

    assert_eq!(back, state);
}

#[test]
fn records_the_schema_version_it_was_written_at() {
    let json = serde_json::to_value(ViewState::empty()).unwrap();

    assert_eq!(
        json.get("schemaVersion"),
        Some(&serde_json::Value::from(VIEW_STATE_SCHEMA_VERSION))
    );
}

#[test]
fn refuses_a_version_it_does_not_know() {
    let json = format!(
        r#"{{ "schemaVersion": {}, "lectures": {{}} }}"#,
        VIEW_STATE_SCHEMA_VERSION + 1
    );

    assert!(serde_json::from_str::<ViewState>(&json).is_err());
}

#[test]
fn a_missing_position_defaults_to_the_top_at_natural_size() {
    // Tolerant in the one safe direction: a file written before offset and zoom existed
    // still restores the right page.
    let json = r#"{ "schemaVersion": 1, "lectures": { "cs454/raft": { "page": 9 } } }"#;

    let state: ViewState = serde_json::from_str(json).unwrap();
    let view = state.position_in(&path("cs454/raft")).unwrap();

    assert_eq!(view.page().get(), 9);
    assert!(view.offset().fraction().abs() < f64::EPSILON);
    assert!((view.zoom().factor() - 1.0).abs() < f64::EPSILON);
}

#[test]
fn deserialization_cannot_bypass_validation() {
    // The whole reason these are value types: a hand-edited or corrupt file must not
    // restore someone to a zoom of zero, which would render a page as nothing.
    for bad in [
        r#"{ "schemaVersion": 1, "lectures": { "cs454/raft": { "page": 0 } } }"#,
        r#"{ "schemaVersion": 1, "lectures": { "cs454/raft": { "page": 1, "zoom": 0.0 } } }"#,
        r#"{ "schemaVersion": 1, "lectures": { "cs454/raft": { "page": 1, "zoom": 1e9 } } }"#,
        r#"{ "schemaVersion": 1, "lectures": { "cs454/raft": { "page": 1, "offset": 1.5 } } }"#,
        r#"{ "schemaVersion": 1, "lectures": { "cs454/raft": { "page": 1, "offset": -0.1 } } }"#,
        r#"{ "schemaVersion": 1, "lectures": { "../escape": { "page": 1 } } }"#,
    ] {
        assert!(
            serde_json::from_str::<ViewState>(bad).is_err(),
            "should have been refused: {bad}"
        );
    }
}

#[test]
fn zoom_accepts_its_whole_supported_range_and_nothing_outside_it() {
    assert!(Zoom::new(MIN_ZOOM).is_ok());
    assert!(Zoom::new(MAX_ZOOM).is_ok());
    assert!(Zoom::new(MIN_ZOOM - 0.01).is_err());
    assert!(Zoom::new(MAX_ZOOM + 0.01).is_err());
    assert!(Zoom::new(f64::NAN).is_err());
    assert!(Zoom::new(f64::INFINITY).is_err());
}

#[test]
fn an_offset_is_a_fraction_of_a_page() {
    assert!(PageOffset::new(0.0).is_ok());
    assert!(PageOffset::new(1.0).is_ok());
    assert!(PageOffset::new(-0.001).is_err());
    assert!(PageOffset::new(1.001).is_err());
    assert!(PageOffset::new(f64::NAN).is_err());
}

#[test]
fn errors_carry_a_code_and_plain_language_remediation() {
    let error = Zoom::new(0.0).unwrap_err();

    assert_eq!(error.code(), "ERR_INVALID_ZOOM");
    assert!(error.remediation().contains("untouched"));

    assert_eq!(
        PageOffset::new(2.0).unwrap_err().code(),
        "ERR_INVALID_PAGE_OFFSET"
    );
}

/// Without pruning the file grows forever and a renamed lecture leaves a ghost.
#[test]
fn pruning_drops_lectures_the_vault_no_longer_has() {
    let mut state = ViewState::empty();
    state.remember(&path("cs454/raft"), LectureView::at_page(page(12)));
    state.remember(&path("cs454/deleted"), LectureView::at_page(page(4)));
    state.remember(&path("cs454/renamed-away"), LectureView::at_page(page(8)));

    state.prune_to(&references(&["cs454/raft"]));

    assert_eq!(state.len(), 1);
    assert!(state.position_in(&path("cs454/raft")).is_some());
    assert!(state.position_in(&path("cs454/deleted")).is_none());
}

#[test]
fn pruning_forgets_a_last_opened_lecture_that_is_gone() {
    // Otherwise launch would try to reopen a lecture that no longer exists.
    let mut state = ViewState::empty();
    state.remember(&path("cs454/raft"), LectureView::at_page(page(12)));
    state.remember(&path("cs454/deleted"), LectureView::at_page(page(4)));
    assert_eq!(state.last_opened(), Some(&path("cs454/deleted")));

    state.prune_to(&references(&["cs454/raft"]));

    assert_eq!(state.last_opened(), None);
}

#[test]
fn pruning_against_an_empty_vault_clears_everything() {
    let mut state = ViewState::empty();
    state.remember(&path("cs454/raft"), LectureView::at_page(page(12)));

    state.prune_to(&[]);

    assert!(state.is_empty());
}

#[test]
fn pruning_keeps_a_page_beyond_a_shortened_document() {
    // Deliberate: this type cannot know how many pages a PDF has, and reading documents
    // to tidy a cache would be the wrong trade. The viewer clamps when it restores.
    let mut state = ViewState::empty();
    state.remember(&path("cs454/raft"), LectureView::at_page(page(9_999)));

    state.prune_to(&references(&["cs454/raft"]));

    assert_eq!(
        state.position_in(&path("cs454/raft")).unwrap().page().get(),
        9_999
    );
}
