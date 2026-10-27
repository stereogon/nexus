//! Contract tests for [`LectureBundle`] and [`BundleRef`].
//!
//! The governing test is `relocating_a_bundle_rewrites_nothing_inside_it`. It is the one
//! the locked decision in `CLAUDE.md` §3 asks for by name, and the property it holds is
//! what lets someone reorganise their vault in Finder with the app closed.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{
    Conversion, CoreError, Facets, Label, LectureBundle, MAX_BUNDLE_DEPTH, MAX_DEPTH,
    MAX_WITHIN_BUNDLE_DEPTH, Manifest, OrderKey, RelativePath, Source, Timestamp,
};

const CREATED: &str = "2026-10-27T16:00:00Z";

fn label(raw: &str) -> Label {
    Label::parse(raw).unwrap()
}

fn path(raw: &str) -> RelativePath {
    RelativePath::parse(raw).unwrap()
}

fn converted_manifest() -> Manifest {
    let source = Source::new(
        path("source/document.pdf"),
        Some(path("source/original.pptx")),
        Conversion::ready(label("libreoffice"), Timestamp::parse(CREATED).unwrap()),
    )
    .unwrap();

    Manifest::new(
        label("Raft Consensus"),
        OrderKey::first(),
        source,
        Timestamp::parse(CREATED).unwrap(),
    )
    .with_facets(
        Facets::default()
            .with_course(label("CS454"))
            .with_week(label("Week 3")),
    )
}

fn native_pdf_manifest() -> Manifest {
    let source = Source::new(
        path("source/document.pdf"),
        None,
        Conversion::not_required(),
    )
    .unwrap();

    Manifest::new(
        label("Already a PDF"),
        OrderKey::first(),
        source,
        Timestamp::parse(CREATED).unwrap(),
    )
}

fn bundle_at(directory: &str) -> LectureBundle {
    LectureBundle::new(path(directory), converted_manifest())
}

#[test]
fn derives_every_path_inside_the_bundle() {
    let bundle = bundle_at("cs454/raft-consensus");

    assert_eq!(
        bundle.manifest_path().unwrap(),
        path("cs454/raft-consensus/manifest.json")
    );
    assert_eq!(
        bundle.notes_path().unwrap(),
        path("cs454/raft-consensus/notes.md")
    );
    assert_eq!(
        bundle.annotations_path().unwrap(),
        path("cs454/raft-consensus/annotations.json")
    );
    assert_eq!(
        bundle.document_path().unwrap(),
        path("cs454/raft-consensus/source/document.pdf")
    );
    assert_eq!(
        bundle.original_path().unwrap(),
        Some(path("cs454/raft-consensus/source/original.pptx"))
    );
}

/// The locked decision, asserted.
#[test]
fn relocating_a_bundle_rewrites_nothing_inside_it() {
    let before = bundle_at("cs454/raft-consensus");
    let after = before.relocated(path("archive/y1/cs454/raft-consensus"));

    // Every derived path moved with the bundle.
    assert_eq!(
        after.document_path().unwrap(),
        path("archive/y1/cs454/raft-consensus/source/document.pdf")
    );
    assert_eq!(
        after.notes_path().unwrap(),
        path("archive/y1/cs454/raft-consensus/notes.md")
    );

    // And the manifest itself is byte-for-byte what it was: nothing inside a bundle
    // records where the bundle is, so a move needs no rewriting at all.
    assert_eq!(
        after.manifest(),
        before.manifest(),
        "moving a bundle must not change its manifest"
    );
    assert_eq!(
        serde_json::to_string(after.manifest()).unwrap(),
        serde_json::to_string(before.manifest()).unwrap()
    );
}

#[test]
fn a_bundle_at_the_vault_root_works_the_same_way() {
    let bundle = LectureBundle::new(
        RelativePath::root_level(lecture_core::Slug::parse("one-off-lecture").unwrap()),
        converted_manifest(),
    );

    assert_eq!(
        bundle.document_path().unwrap(),
        path("one-off-lecture/source/document.pdf")
    );
}

/// The regression test for a real bug: these two caps are not the same number.
#[test]
fn a_bundle_at_the_deepest_allowed_level_can_still_address_its_files() {
    // Five levels of organisational nesting is exactly what the spec permits. With the
    // path cap conflated with the nesting cap, `manifest.json` here was six segments and
    // therefore refused -- so a legitimate layout produced a lecture the app could not
    // open at all.
    let deepest = "y1/cs454/consensus/week-03/raft";
    assert_eq!(deepest.split('/').count(), MAX_BUNDLE_DEPTH);

    let bundle = bundle_at(deepest);

    assert_eq!(
        bundle.manifest_path().unwrap(),
        path("y1/cs454/consensus/week-03/raft/manifest.json")
    );
    assert_eq!(
        bundle.document_path().unwrap(),
        path("y1/cs454/consensus/week-03/raft/source/document.pdf")
    );
}

#[test]
fn the_path_cap_is_the_sum_of_the_two_nesting_caps() {
    // Stated as a test as well as a compile-time assertion, so the *reason* is written
    // down where someone changing one of them will read it.
    assert_eq!(MAX_DEPTH, MAX_BUNDLE_DEPTH + MAX_WITHIN_BUNDLE_DEPTH);
}

#[test]
fn the_deepest_bundle_plus_the_reserved_headroom_is_exactly_allowed() {
    // 5 + 3 is the limit, not past it. Worth pinning: the first version of this test
    // asserted it was refused, which would have been the old conflated cap's behaviour.
    let joined = path("y1/cs454/consensus/week-03/raft")
        .join(&path("assets/week-03/diagrams"))
        .unwrap();

    assert_eq!(joined.depth(), MAX_DEPTH);
}

#[test]
fn refuses_to_derive_a_path_deeper_than_the_vault_allows() {
    // A hand-edited manifest can name an absurd in-bundle path. The join must refuse it
    // rather than produce something the storage layer would then have to catch.
    let err = path("y1/cs454/consensus/week-03/raft")
        .join(&path("a/b/c/d"))
        .unwrap_err();

    assert!(matches!(err, CoreError::RelativePathTooDeep { .. }));
    assert_eq!(err.code(), "ERR_RELATIVE_PATH_TOO_DEEP");
}

#[test]
fn joins_two_paths_into_one() {
    assert_eq!(
        path("cs454/raft")
            .join(&path("source/document.pdf"))
            .unwrap(),
        path("cs454/raft/source/document.pdf")
    );
}

#[test]
fn a_document_that_needed_no_conversion_keeps_no_original() {
    let bundle = LectureBundle::new(path("cs454/native"), native_pdf_manifest());

    assert_eq!(
        bundle.original_path().unwrap(),
        None,
        "an unconverted PDF is its own original"
    );
    assert_eq!(
        bundle.document_path().unwrap(),
        path("cs454/native/source/document.pdf")
    );
}

#[test]
fn the_sidebar_projection_carries_what_it_needs_and_no_more() {
    let bundle = bundle_at("cs454/raft-consensus");
    let reference = bundle.reference();

    assert_eq!(reference.directory(), bundle.directory());
    assert_eq!(reference.title().as_str(), "Raft Consensus");
    assert_eq!(reference.sequence(), &OrderKey::first());
    assert_eq!(
        reference.facets().course().map(Label::as_str),
        Some("CS454")
    );
}

#[test]
fn a_relocated_bundle_s_reference_points_at_the_new_place() {
    let moved = bundle_at("cs454/raft").relocated(path("archive/raft"));

    assert_eq!(moved.reference().directory(), &path("archive/raft"));
    assert_eq!(
        moved.reference().title(),
        bundle_at("cs454/raft").reference().title(),
        "moving a lecture does not retitle it"
    );
}
