//! Manifest version 3: the lecture's number, and reading the versions before it.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use lecture_core::{CURRENT_SCHEMA_VERSION, LectureNumber, Manifest};

/// Exactly what version 2 wrote: no number field at all.
const V2: &str = r#"{"schemaVersion":2,"title":"Process Overview","sequence":"a1","facets":{},"source":{"document":"source/document.pdf","conversion":{"state":"notRequired"}},"createdAt":"2026-10-27T16:00:00Z","updatedAt":"2026-10-27T16:00:00Z"}"#;

#[test]
fn the_current_version_is_4() {
    // 3 added the number; 4 (2026-11-06) made the source optional, for plain notes.
    assert_eq!(CURRENT_SCHEMA_VERSION, 4);
}

#[test]
fn a_version_2_manifest_reads_with_no_number() {
    let parsed: Manifest = serde_json::from_str(V2).expect("version 2 must still be readable");

    assert_eq!(parsed.number(), None);
    assert_eq!(parsed.title().as_str(), "Process Overview");
}

#[test]
fn a_manifest_without_a_number_is_written_without_the_field() {
    // Not `"number": null`: absent is what "no number" has always looked like.
    let parsed: Manifest = serde_json::from_str(V2).unwrap();
    let written = serde_json::to_string(&parsed).unwrap();

    assert!(!written.contains("number"), "{written}");
    assert!(written.contains(r#""schemaVersion":4"#), "{written}");
}

#[test]
fn a_number_survives_a_round_trip() {
    let numbered = serde_json::from_str::<Manifest>(V2)
        .unwrap()
        .with_number(LectureNumber::parse("2"));

    let written = serde_json::to_string(&numbered).unwrap();
    let read: Manifest = serde_json::from_str(&written).unwrap();

    assert!(written.contains(r#""number":"2""#), "{written}");
    assert_eq!(read.number().map(LectureNumber::as_str), Some("2"));
}

#[test]
fn a_hand_edited_number_nobody_could_type_is_refused() {
    let bad = V2.replace(
        r#""schemaVersion":2,"#,
        r#""schemaVersion":3,"number":"3/4","#,
    );

    assert!(serde_json::from_str::<Manifest>(&bad).is_err());
}
