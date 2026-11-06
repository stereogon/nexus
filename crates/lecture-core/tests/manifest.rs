//! Contract tests for [`Manifest`] and [`Source`].
//!
//! Most of these are about a file that someone hand-edited: a manifest is plain JSON in
//! a folder people browse, so it *will* be edited, and every inconsistency below is one
//! a person could plausibly create.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{
    CURRENT_SCHEMA_VERSION, Conversion, CoreError, Facets, Label, Manifest, OrderKey, RelativePath,
    Source, Timestamp,
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

    assert!(json.contains(r#""schemaVersion": 3"#), "got: {json}");
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
fn refuses_a_manifest_from_a_version_outside_the_readable_span() {
    // Both directions. A newer file is the common case; a version below the oldest
    // readable one can only come from a hand-edit, and must be refused rather than
    // guessed at.
    for version in [CURRENT_SCHEMA_VERSION + 1, 0] {
        let mut value = serde_json::to_value(manifest()).unwrap();
        let object = value
            .as_object_mut()
            .expect("a manifest serialises to a JSON object");
        object.insert("schemaVersion".to_owned(), serde_json::json!(version));

        let err = serde_json::from_value::<Manifest>(value).unwrap_err();
        assert!(
            err.to_string().contains("schema"),
            "version {version} should be refused for its version, got: {err}"
        );
    }
}

/// The migration, stated as the behaviour rather than as a transformation.
#[test]
fn reads_a_version_1_manifest_and_upgrades_it_on_the_way_in() {
    // Exactly what version 1 wrote: no fingerprint fields at all.
    let v1 = r#"{"schemaVersion":1,"title":"Distributed Consensus","sequence":"a0","facets":{},"source":{"document":"source/document.pdf","original":"source/original.pptx","conversion":{"state":"ready","converter":"libreoffice","convertedAt":"2026-10-27T16:00:00Z"}},"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}"#;

    let parsed: Manifest = serde_json::from_str(v1).expect("version 1 must still be readable");

    // Absent is what version 1 meant, and it must not be confused with "unchanged".
    assert_eq!(parsed.source().document_fingerprint(), None);
    assert_eq!(parsed.source().original_fingerprint(), None);
    assert_eq!(parsed.title().as_str(), "Distributed Consensus");

    // Reading did not rewrite anything; saving is what migrates the file.
    let written = serde_json::to_value(&parsed).unwrap();
    assert_eq!(
        written
            .get("schemaVersion")
            .and_then(serde_json::Value::as_u64),
        Some(u64::from(CURRENT_SCHEMA_VERSION)),
        "a value in memory is current by construction, so writing it completes the upgrade"
    );
}

#[test]
fn a_version_1_manifest_is_not_rewritten_with_fields_it_never_had() {
    // The upgrade must not invent a fingerprint. An empty string or a zero would both be
    // indistinguishable from a real one later, and would make "has this changed?" answer
    // confidently and wrongly.
    let v1 = r#"{"schemaVersion":1,"title":"T","sequence":"a0","source":{"document":"source/document.pdf","conversion":{"state":"notRequired"}},"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}"#;

    let parsed: Manifest = serde_json::from_str(v1).unwrap();
    let written = serde_json::to_string(&parsed).unwrap();

    assert!(
        !written.contains("Fingerprint"),
        "no fingerprint field should be written when none is known: {written}"
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
