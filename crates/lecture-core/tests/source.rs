//! Contract tests for the record of where a bundle's document came from.
//!
//! Split from `manifest.rs`, which was over the 300-line limit and holding two subjects.
//! These are about `Source` and `Conversion`: whether a provenance record describes
//! something that could actually exist. Every case here is a file a person could
//! hand-edit into existence, which is the reason the checks are in `try_from` rather than
//! only in the constructors.
//!
//! The manifest's own rules -- identity, timestamps, schema version, taxonomy -- stayed
//! behind in `manifest.rs`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{
    Conversion, ConversionState, CoreError, Fingerprint, Label, RelativePath, Source, Timestamp,
};

fn label(raw: &str) -> Label {
    Label::parse(raw).unwrap()
}

fn path(raw: &str) -> RelativePath {
    RelativePath::parse(raw).unwrap()
}

fn at(raw: &str) -> Timestamp {
    Timestamp::parse(raw).unwrap()
}

fn native_source() -> Source {
    Source::new(
        path("source/document.pdf"),
        None,
        Conversion::not_required(),
    )
    .unwrap()
}

fn converted_source() -> Source {
    Source::new(
        path("source/document.pdf"),
        Some(path("source/original.pptx")),
        Conversion::ready(label("libreoffice"), at("2026-10-27T16:00:00Z")),
    )
    .unwrap()
}

#[test]
fn an_unconverted_pdf_keeps_no_separate_original() {
    let source = native_source();

    assert_eq!(source.conversion().state(), ConversionState::NotRequired);
    assert!(source.original().is_none());
    assert!(source.conversion().converter().is_none());
}

#[test]
fn a_converted_document_records_its_whole_provenance() {
    // The point of recording this: an iPad that cannot run LibreOffice can still say
    // where this PDF came from instead of guessing.
    let source = converted_source();

    assert_eq!(source.conversion().state(), ConversionState::Ready);
    assert_eq!(
        source.original().unwrap().to_string(),
        "source/original.pptx"
    );
    assert_eq!(
        source.conversion().converter().unwrap().as_str(),
        "libreoffice"
    );
    assert_eq!(
        source.conversion().converted_at().unwrap().as_str(),
        "2026-10-27T16:00:00Z"
    );
}

#[test]
fn a_converted_document_must_keep_its_original() {
    // Otherwise a bad conversion is the end of the road for the imported file.
    let err = Source::new(
        path("source/document.pdf"),
        None,
        Conversion::ready(label("libreoffice"), at("2026-10-27T16:00:00Z")),
    )
    .unwrap_err();

    assert!(matches!(err, CoreError::InvalidManifest { .. }));
    assert_eq!(err.code(), "ERR_INVALID_MANIFEST");
}

#[test]
fn a_failed_conversion_still_keeps_the_original() {
    let kept = Source::new(
        path("source/document.pdf"),
        Some(path("source/original.pptx")),
        Conversion::failed(label("libreoffice")),
    )
    .unwrap();
    assert_eq!(kept.conversion().state(), ConversionState::Failed);

    let discarded = Source::new(
        path("source/document.pdf"),
        None,
        Conversion::failed(label("libreoffice")),
    );
    assert!(discarded.is_err(), "a failure must not lose the original");
}

#[test]
fn an_unconverted_document_cannot_claim_a_converter() {
    let err = Source::new(
        path("source/document.pdf"),
        Some(path("source/original.pptx")),
        Conversion::not_required(),
    )
    .unwrap_err();

    assert!(matches!(err, CoreError::InvalidManifest { .. }));
}

#[test]
fn a_conversion_in_progress_cannot_have_finished() {
    let queued = Source::new(
        path("source/document.pdf"),
        Some(path("source/original.pptx")),
        Conversion::queued(),
    )
    .unwrap();
    assert_eq!(queued.conversion().state(), ConversionState::Queued);
    assert!(queued.conversion().converted_at().is_none());
}

#[test]
fn the_original_and_the_rendered_document_cannot_be_the_same_file() {
    // Converting a file onto itself would destroy the import.
    let err = Source::new(
        path("source/document.pdf"),
        Some(path("source/document.pdf")),
        Conversion::ready(label("libreoffice"), at("2026-10-27T16:00:00Z")),
    )
    .unwrap_err();

    assert!(matches!(err, CoreError::InvalidManifest { .. }));
}

#[test]
fn a_fresh_source_records_no_fingerprints_yet() {
    // Absent means "nothing has read the file", which is not the same as "unchanged".
    // Conflating the two would let the app report a document as verified when it never
    // looked at it.
    let source = native_source();

    assert_eq!(source.document_fingerprint(), None);
    assert_eq!(source.original_fingerprint(), None);
}

#[test]
fn records_fingerprints_for_the_files_it_names() {
    let document = Fingerprint::of(b"the rendered pdf");
    let original = Fingerprint::of(b"the imported pptx");

    let source = converted_source()
        .with_fingerprints(Some(document), Some(original))
        .unwrap();

    assert_eq!(source.document_fingerprint(), Some(&document));
    assert_eq!(source.original_fingerprint(), Some(&original));
}

#[test]
fn a_native_pdf_can_have_a_document_fingerprint_with_no_original() {
    let document = Fingerprint::of(b"the rendered pdf");

    let source = native_source()
        .with_fingerprints(Some(document), None)
        .unwrap();

    assert_eq!(source.document_fingerprint(), Some(&document));
    assert_eq!(source.original_fingerprint(), None);
}

#[test]
fn refuses_a_fingerprint_for_an_original_that_is_not_there() {
    // A fingerprint with nothing to be a fingerprint *of* is the one shape here that
    // could mislead later: a "has the original changed?" check would have something to
    // compare and no file to compare it against.
    let err = native_source()
        .with_fingerprints(None, Some(Fingerprint::of(b"nothing")))
        .unwrap_err();

    assert!(matches!(err, CoreError::InvalidManifest { .. }));
    assert!(err.remediation().contains("Nothing was deleted"));
}

#[test]
fn a_hand_edited_orphan_fingerprint_is_refused_on_the_way_in() {
    // The same rule, reached the way it would really be reached.
    let json = r#"{"document":"source/document.pdf","originalFingerprint":"cbf29ce484222325","conversion":{"state":"notRequired"}}"#;

    let err = serde_json::from_str::<Source>(json).unwrap_err();

    assert!(
        err.to_string().contains("original"),
        "the cause should name the missing original, got: {err}"
    );
}

#[test]
fn fingerprints_survive_a_json_round_trip() {
    let original = converted_source()
        .with_fingerprints(
            Some(Fingerprint::of(b"pdf bytes")),
            Some(Fingerprint::of(b"pptx bytes")),
        )
        .unwrap();

    let json = serde_json::to_string(&original).unwrap();
    let parsed: Source = serde_json::from_str(&json).unwrap();

    assert_eq!(original, parsed);
    assert!(
        json.contains("documentFingerprint"),
        "the stored field should be camelCase like the rest of the file: {json}"
    );
}

#[test]
fn an_unknown_fingerprint_is_left_out_of_the_file_rather_than_written_as_null() {
    // A null would be a third state for a reader to interpret, and `deny_unknown_fields`
    // plus `skip_serializing_if` means absent is the only spelling of "not known".
    let json = serde_json::to_string(&native_source()).unwrap();

    assert!(!json.contains("Fingerprint"), "got: {json}");
    assert!(!json.contains("null"), "got: {json}");
}
