//! Contract tests for re-marking a highlight: [`AnnotationSet::retag`] and
//! [`Annotation::retagged`].
//!
//! Apart from `annotation_set.rs` because the rule under test is one the set's other
//! cases do not share: a change keeps the id, since `cite://<id>` in the notes points at
//! it.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{
    Annotation, AnnotationId, AnnotationSet, Excerpt, HighlightSemantic, NormalizedRect,
    PageNumber, Timestamp,
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

const LATER: &str = "2026-11-05T09:30:00Z";

#[test]
fn retagging_changes_what_a_highlight_means_and_not_what_it_is() {
    // The id is what `cite://<id>` in the notes points at. Changing key to exam must not
    // break a single link, so everything but the meaning and the change time stays.
    let mut set = AnnotationSet::empty();
    set.insert(highlight("hl-one", 3)).unwrap();
    let before = set.get(&id("hl-one")).unwrap().clone();

    let after = set
        .retag(&id("hl-one"), HighlightSemantic::Exam, &at(LATER))
        .unwrap();

    assert_eq!(after.semantic(), Some(HighlightSemantic::Exam));
    assert_eq!(after.id(), before.id());
    assert_eq!(after.page(), before.page());
    assert_eq!(after.text(), before.text());
    assert_eq!(
        after.bounding_rect().unwrap(),
        before.bounding_rect().unwrap()
    );
    assert_eq!(after.created_at(), before.created_at());
    assert_eq!(after.updated_at(), &at(LATER));
}

#[test]
fn a_retag_is_held_by_the_set_and_not_only_returned() {
    let mut set = AnnotationSet::empty();
    set.insert(highlight("hl-one", 1)).unwrap();

    set.retag(&id("hl-one"), HighlightSemantic::Question, &at(LATER));

    assert_eq!(
        set.get(&id("hl-one")).unwrap().semantic(),
        Some(HighlightSemantic::Question)
    );
    assert_eq!(set.len(), 1);
}

#[test]
fn retagging_an_area_highlight_keeps_its_caption_and_region() {
    let mut set = AnnotationSet::empty();
    let region = rect(0.1, 0.4, 0.5, 0.3);
    set.insert(Annotation::area_highlight(
        id("area-one"),
        page(2),
        HighlightSemantic::Definition,
        region,
        Some(quote("The Raft state machine")),
        at(MADE),
    ))
    .unwrap();

    let after = set
        .retag(&id("area-one"), HighlightSemantic::Key, &at(LATER))
        .unwrap();

    assert_eq!(after.semantic(), Some(HighlightSemantic::Key));
    assert_eq!(after.bounding_rect().unwrap(), region);
    assert_eq!(
        after.text().map(Excerpt::as_str),
        Some("The Raft state machine")
    );
}

#[test]
fn a_text_box_has_no_meaning_to_change() {
    // Not an error: there is no highlight with that id, which is the same answer as for
    // one removed on another device.
    let mut set = AnnotationSet::empty();
    let typed = Annotation::text_box(
        id("box-one"),
        page(1),
        rect(0.2, 0.2, 0.3, 0.1),
        quote("Important exam formula"),
        at(MADE),
    );
    set.insert(typed.clone()).unwrap();

    assert!(
        set.retag(&id("box-one"), HighlightSemantic::Exam, &at(LATER))
            .is_none()
    );
    assert_eq!(set.get(&id("box-one")), Some(&typed));
}

#[test]
fn retagging_something_absent_changes_nothing() {
    let mut set = AnnotationSet::empty();
    set.insert(highlight("hl-one", 1)).unwrap();

    assert!(
        set.retag(&id("hl-gone"), HighlightSemantic::Exam, &at(LATER))
            .is_none()
    );
    assert_eq!(
        set.get(&id("hl-one")).unwrap().semantic(),
        Some(HighlightSemantic::Key)
    );
}

#[test]
fn a_clock_behind_the_device_that_made_it_cannot_unmake_it() {
    // Two devices, one a minute slow. The change has to be possible on either, and must
    // not produce an annotation claiming it changed before it existed -- which `validate`
    // would then refuse to load.
    let mut set = AnnotationSet::empty();
    set.insert(highlight("hl-one", 1)).unwrap();

    let after = set
        .retag(
            &id("hl-one"),
            HighlightSemantic::Exam,
            &at("2026-10-27T15:59:00Z"),
        )
        .unwrap();

    assert_eq!(after.updated_at(), &at(MADE));
    assert!(after.validate().is_ok());
    assert!(set.validate().is_ok());
}
