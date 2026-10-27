//! Contract tests for [`NormalizedRect`].
//!
//! These exercise the public API only, which is the surface that both the Tauri
//! adapter and a future Swift binding will see.

// Tests are allowed to panic on failure; that is how they report. Production code is
// held to `deny` for all of these by the workspace lints.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::float_cmp
)]

use lecture_core::{CoreError, NormalizedRect};

#[test]
fn accepts_a_typical_text_highlight() {
    let rect = NormalizedRect::new(0.142, 0.285, 0.612, 0.032).unwrap();

    assert_eq!(rect.x(), 0.142);
    assert_eq!(rect.y(), 0.285);
    assert_eq!(rect.width(), 0.612);
    assert_eq!(rect.height(), 0.032);
}

#[test]
fn accepts_a_rectangle_covering_the_whole_page() {
    let rect = NormalizedRect::new(0.0, 0.0, 1.0, 1.0).unwrap();

    assert_eq!(rect.right(), 1.0);
    assert_eq!(rect.bottom(), 1.0);
}

#[test]
fn computes_right_and_bottom_edges() {
    let rect = NormalizedRect::new(0.2, 0.3, 0.5, 0.25).unwrap();

    assert_eq!(rect.right(), 0.7);
    assert_eq!(rect.bottom(), 0.55);
}

#[test]
fn rejects_nan_in_every_component() {
    for (label, result) in [
        ("x", NormalizedRect::new(f64::NAN, 0.1, 0.1, 0.1)),
        ("y", NormalizedRect::new(0.1, f64::NAN, 0.1, 0.1)),
        ("width", NormalizedRect::new(0.1, 0.1, f64::NAN, 0.1)),
        ("height", NormalizedRect::new(0.1, 0.1, 0.1, f64::NAN)),
    ] {
        assert!(
            result.is_err(),
            "a NaN in `{label}` must be rejected, not stored"
        );
    }
}

#[test]
fn rejects_infinity_in_every_component() {
    assert!(NormalizedRect::new(f64::INFINITY, 0.1, 0.1, 0.1).is_err());
    assert!(NormalizedRect::new(0.1, f64::NEG_INFINITY, 0.1, 0.1).is_err());
    assert!(NormalizedRect::new(0.1, 0.1, f64::INFINITY, 0.1).is_err());
    assert!(NormalizedRect::new(0.1, 0.1, 0.1, f64::INFINITY).is_err());
}

#[test]
fn rejects_an_origin_outside_the_unit_interval() {
    assert!(NormalizedRect::new(-0.001, 0.1, 0.1, 0.1).is_err());
    assert!(NormalizedRect::new(1.001, 0.1, 0.1, 0.1).is_err());
    assert!(NormalizedRect::new(0.1, -0.001, 0.1, 0.1).is_err());
    assert!(NormalizedRect::new(0.1, 1.001, 0.1, 0.1).is_err());
}

#[test]
fn rejects_a_non_positive_extent() {
    // A zero-area rectangle would persist as an annotation nobody can see or click.
    assert!(NormalizedRect::new(0.1, 0.1, 0.0, 0.1).is_err());
    assert!(NormalizedRect::new(0.1, 0.1, 0.1, 0.0).is_err());
    assert!(NormalizedRect::new(0.1, 0.1, -0.2, 0.1).is_err());
    assert!(NormalizedRect::new(0.1, 0.1, 0.1, -0.2).is_err());
}

#[test]
fn rejects_a_rectangle_running_past_the_page_edge() {
    let right = NormalizedRect::new(0.9, 0.1, 0.2, 0.1).unwrap_err();
    assert!(matches!(right, CoreError::RectOutOfBounds { .. }));

    let bottom = NormalizedRect::new(0.1, 0.95, 0.1, 0.2).unwrap_err();
    assert!(matches!(bottom, CoreError::RectOutOfBounds { .. }));
}

#[test]
fn tolerates_float_drift_at_the_page_edge() {
    // What PDF.js actually hands back for a highlight on the last word of a line,
    // after the viewport transform has been applied and divided back out.
    let rect = NormalizedRect::new(0.5, 0.5, 0.500_000_000_000_000_2, 0.1);

    assert!(
        rect.is_ok(),
        "sub-pixel drift at the page edge must not drop a legitimate highlight"
    );
}

#[test]
fn drift_tolerance_does_not_mask_a_real_overflow() {
    // One part in a thousand is a positioning bug, not float noise.
    assert!(NormalizedRect::new(0.5, 0.5, 0.501, 0.1).is_err());
}

#[test]
fn reports_a_stable_machine_readable_code() {
    let err = NormalizedRect::new(2.0, 0.1, 0.1, 0.1).unwrap_err();

    assert_eq!(err.code(), "ERR_INVALID_COORDINATE");
    assert!(!err.remediation().is_empty());
}

#[test]
fn remediation_never_leaks_an_internal_symbol() {
    let err = NormalizedRect::new(f64::NAN, 0.1, 0.1, 0.1).unwrap_err();
    let text = err.remediation();

    for jargon in ["NormalizedRect", "unwrap", "serde", "None", "Err("] {
        assert!(
            !text.contains(jargon),
            "remediation shown to a student must not contain `{jargon}`"
        );
    }
}

#[test]
fn survives_a_json_round_trip() {
    let original = NormalizedRect::new(0.142, 0.285, 0.612, 0.032).unwrap();

    let json = serde_json::to_string(&original).unwrap();
    let parsed: NormalizedRect = serde_json::from_str(&json).unwrap();

    assert_eq!(original, parsed);
}

#[test]
fn serializes_to_the_field_names_the_schema_specifies() {
    let rect = NormalizedRect::new(0.142, 0.285, 0.612, 0.032).unwrap();
    let json = serde_json::to_value(rect).unwrap();

    for field in ["x", "y", "width", "height"] {
        assert!(
            json.get(field).is_some(),
            "annotations.json schema requires a `{field}` field"
        );
    }
}

/// The important one.
///
/// Validation that only runs in constructors protects code paths and not files. A
/// hand-edited or partially-written `annotations.json` must fail to parse rather than
/// yield a rectangle that draws a highlight over the wrong sentence.
#[test]
fn deserialization_cannot_bypass_validation() {
    let cases = [
        (
            r#"{"x":-0.5,"y":0.1,"width":0.1,"height":0.1}"#,
            "negative x",
        ),
        (
            r#"{"x":1.5,"y":0.1,"width":0.1,"height":0.1}"#,
            "x past page",
        ),
        (
            r#"{"x":0.1,"y":0.1,"width":0.0,"height":0.1}"#,
            "zero width",
        ),
        (
            r#"{"x":0.1,"y":0.1,"width":-0.3,"height":0.1}"#,
            "negative width",
        ),
        (
            r#"{"x":0.9,"y":0.1,"width":0.5,"height":0.1}"#,
            "overflows right edge",
        ),
    ];

    for (json, description) in cases {
        let parsed = serde_json::from_str::<NormalizedRect>(json);
        assert!(
            parsed.is_err(),
            "a stored rectangle with {description} must be rejected on read, got {parsed:?}"
        );
    }
}

#[test]
fn deserialization_rejects_a_missing_field() {
    let parsed = serde_json::from_str::<NormalizedRect>(r#"{"x":0.1,"y":0.1,"width":0.1}"#);

    assert!(
        parsed.is_err(),
        "a truncated rectangle must not default its missing side to zero"
    );
}
