//! Contract tests for [`Manifest`] and [`Source`].
//!
//! Most of these are about a file that someone hand-edited: a manifest is plain JSON in
//! a folder people browse, so it *will* be edited, and every inconsistency below is one
//! a person could plausibly create.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{
    CURRENT_SCHEMA_VERSION, Conversion, ConversionState, CoreError, Facets, Label, Manifest,
    OrderKey, RelativePath, Source, Timestamp,
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

/// A bundle holding a PDF that was imported as a PDF.
fn native_source() -> Source {
    Source::new(
        path("source/document.pdf"),
        None,
        Conversion::not_required(),
    )
    .unwrap()
}

/// A bundle holding a PDF converted from a `PowerPoint` deck.
fn converted_source() -> Source {
    Source::new(
        path("source/document.pdf"),
        Some(path("source/original.pptx")),
        Conversion::ready(label("libreoffice"), at("2026-10-27T16:00:00Z")),
    )
    .unwrap()
}

fn manifest() -> Manifest {
    Manifest::new(
        label("Distributed Consensus"),
        OrderKey::first(),
        converted_source(),
        at("2026-10-27T16:00:00Z"),
    )
}

#[test]
fn describes_a_newly_imported_lecture() {
    let manifest = manifest();

    assert_eq!(manifest.title().as_str(), "Distributed Consensus");
    assert_eq!(manifest.sequence(), &OrderKey::first());
    assert_eq!(manifest.created_at(), manifest.updated_at());
    assert_eq!(manifest.facets(), &Facets::empty());
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
fn touching_moves_the_changed_time_forward() {
    let original = manifest();
    let later = original.touched(at("2026-10-28T09:30:00Z")).unwrap();

    assert_eq!(later.created_at(), original.created_at());
    assert_eq!(later.updated_at().as_str(), "2026-10-28T09:30:00Z");
    assert!(later.updated_at() > later.created_at());
}

#[test]
fn refuses_to_be_changed_before_it_was_created() {
    // A clock that moved backwards must not produce a manifest that claims to have been
    // edited before it existed.
    let err = manifest().touched(at("2020-01-01T00:00:00Z")).unwrap_err();

    assert!(matches!(err, CoreError::InvalidManifest { .. }));
}

#[test]
fn serialises_the_shape_the_schema_describes() {
    let json = serde_json::to_string_pretty(&manifest()).unwrap();

    assert!(json.contains(r#""schemaVersion": 1"#), "got: {json}");
    assert!(json.contains(r#""title": "Distributed Consensus""#));
    assert!(json.contains(r#""sequence": "a0""#));
    assert!(json.contains(r#""document": "source/document.pdf""#));
    assert!(json.contains(r#""state": "ready""#));
    assert!(json.contains(r#""converter": "libreoffice""#));
    // Nothing is set, so the taxonomy serialises as an empty object rather than nulls.
    assert!(json.contains(r#""facets": {}"#));
}

#[test]
fn survives_a_json_round_trip() {
    let original = manifest().with_facets(
        Facets::empty()
            .with_course(label("CS454"))
            .with_tags(vec![label("raft"), label("consensus")]),
    );

    let json = serde_json::to_string(&original).unwrap();
    let parsed: Manifest = serde_json::from_str(&json).unwrap();

    assert_eq!(original, parsed);
}

#[test]
fn saving_always_writes_the_current_schema_version() {
    // A manifest in memory is current by construction, so a save cannot write a stale
    // version even if one was somehow read.
    let json = serde_json::to_value(manifest()).unwrap();

    assert_eq!(
        json.get("schemaVersion")
            .and_then(serde_json::Value::as_u64),
        Some(u64::from(CURRENT_SCHEMA_VERSION))
    );
}

#[test]
fn refuses_a_manifest_from_another_schema_version() {
    let mut value = serde_json::to_value(manifest()).unwrap();
    let object = value
        .as_object_mut()
        .expect("a manifest serialises to a JSON object");
    object.insert("schemaVersion".to_owned(), serde_json::json!(2));

    let err = serde_json::from_value::<Manifest>(value).unwrap_err();
    assert!(
        err.to_string().contains("schema"),
        "the version mismatch should be the reported cause, got: {err}"
    );
}

#[test]
fn deserialization_cannot_bypass_the_cross_field_checks() {
    // Every one of these is a file a person could hand-edit into existence.
    let inconsistent = [
        // Ready, but the original was deleted from the record.
        r#"{"schemaVersion":1,"title":"T","sequence":"a0","source":{"document":"source/document.pdf","conversion":{"state":"ready","converter":"libreoffice","convertedAt":"2026-10-27T16:00:00Z"}},"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}"#,
        // Ready, but no converter named.
        r#"{"schemaVersion":1,"title":"T","sequence":"a0","source":{"document":"source/document.pdf","original":"source/original.pptx","conversion":{"state":"ready","convertedAt":"2026-10-27T16:00:00Z"}},"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}"#,
        // Changed before it was created.
        r#"{"schemaVersion":1,"title":"T","sequence":"a0","source":{"document":"source/document.pdf","conversion":{"state":"notRequired"}},"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2020-01-01T00:00:00Z"}"#,
        // An unknown field, which must be reported rather than dropped.
        r#"{"schemaVersion":1,"title":"T","sequence":"a0","lastOpenedPage":4,"source":{"document":"source/document.pdf","conversion":{"state":"notRequired"}},"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}"#,
    ];

    for json in inconsistent {
        let parsed = serde_json::from_str::<Manifest>(json);
        assert!(
            parsed.is_err(),
            "this manifest must be refused on read: {json}"
        );
    }
}

#[test]
fn reads_a_minimal_manifest_with_no_taxonomy() {
    // Importing one PDF must not require inventing a course code first.
    let json = r#"{"schemaVersion":1,"title":"Raft","sequence":"a0","source":{"document":"source/document.pdf","conversion":{"state":"notRequired"}},"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}"#;

    let parsed: Manifest = serde_json::from_str(json).unwrap();

    assert_eq!(parsed.title().as_str(), "Raft");
    assert_eq!(parsed.facets(), &Facets::empty());
}

#[test]
fn corrects_a_hand_edited_tag_order_on_read() {
    let json = r#"{"schemaVersion":1,"title":"Raft","sequence":"a0","facets":{"tags":["raft","consensus","raft"]},"source":{"document":"source/document.pdf","conversion":{"state":"notRequired"}},"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}"#;

    let parsed: Manifest = serde_json::from_str(json).unwrap();

    let tags: Vec<&str> = parsed.facets().tags().iter().map(Label::as_str).collect();
    assert_eq!(tags, ["consensus", "raft"], "order fixed, nothing lost");
}
