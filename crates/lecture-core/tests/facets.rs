//! Contract tests for [`Label`] and [`Facets`].
//!
//! The recurring theme is grouping: two values that look the same to a person must be
//! the same value to the sidebar, or one course quietly becomes two.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{CoreError, Facets, Label};

fn label(raw: &str) -> Label {
    Label::parse(raw).unwrap_or_else(|e| panic!("`{raw}` should be a valid label: {e}"))
}

#[test]
fn accepts_text_a_person_would_actually_type() {
    for raw in [
        "CS454",
        "Distributed Consensus",
        "Week 3",
        "Reading Week",
        "微积分",
        "Fourier Transformation",
        "Module 2 — Consensus",
    ] {
        assert!(Label::parse(raw).is_ok(), "`{raw}` should be accepted");
    }
}

/// The property labels exist for.
#[test]
fn values_that_look_the_same_are_the_same() {
    // Each of these would otherwise become its own group in the sidebar.
    assert_eq!(label("CS 454"), label("CS  454"));
    assert_eq!(label("CS454"), label("  CS454  "));
    // A tab or newline usually arrives from a title pasted out of a PDF, so it is
    // collapsed rather than refused.
    assert_eq!(label("CS 454"), label("CS\t454"));
    assert_eq!(label("CS 454"), label("\nCS 454\n"));
    assert_eq!(label("Raft Consensus"), label("Raft\nConsensus"));

    // Decomposed vs precomposed, as with folder names.
    assert_eq!(label("Cafe\u{301}"), label("Caf\u{e9}"));
}

#[test]
fn preserves_meaningful_differences() {
    // Normalisation must not go so far as to merge genuinely different values.
    assert_ne!(label("CS454"), label("CS455"));
    assert_ne!(label("Week 3"), label("Week 3a"));
    assert_ne!(
        label("cs454"),
        label("CS454"),
        "case is meaningful on screen"
    );
}

#[test]
fn rejects_text_that_is_not_really_text() {
    // Note the split: a NUL or an escape is refused, but `\t\n` is refused only because
    // nothing visible survives collapsing it, not because tabs are banned.
    for raw in [
        "",
        "   ",
        "\t\n",
        "\u{200B}",
        "CS\u{0}454",
        "CS\u{202E}454",
        "CS\u{1b}454",
    ] {
        assert!(
            Label::parse(raw).is_err(),
            "`{}` must be refused",
            raw.escape_unicode()
        );
    }
}

#[test]
fn rejects_text_far_longer_than_any_title() {
    assert!(Label::parse(&"a".repeat(500)).is_ok());
    assert!(Label::parse(&"a".repeat(501)).is_err());
}

#[test]
fn a_lecture_may_carry_no_taxonomy_at_all() {
    // Importing one PDF must not require inventing a course code first.
    let facets = Facets::empty();

    assert!(facets.course().is_none());
    assert!(facets.tags().is_empty());
    assert!(facets.custom().is_empty());
    facets.validate().unwrap();
}

#[test]
fn carries_the_built_in_facets() {
    let facets = Facets::empty()
        .with_course(label("CS454"))
        .with_module(label("Module 2"))
        .with_week(label("Week 3"));

    assert_eq!(facets.course().unwrap().as_str(), "CS454");
    assert_eq!(facets.module().unwrap().as_str(), "Module 2");
    assert_eq!(facets.week().unwrap().as_str(), "Week 3");
}

#[test]
fn tags_are_a_set_not_a_list() {
    // Stored sorted and de-duplicated, so two devices adding the same tag converge on
    // identical bytes rather than conflicting over order.
    let facets = Facets::empty().with_tags(vec![
        label("raft"),
        label("exam"),
        label("consensus"),
        label("exam"),
    ]);

    let stored: Vec<&str> = facets.tags().iter().map(Label::as_str).collect();
    assert_eq!(stored, ["consensus", "exam", "raft"]);
}

#[test]
fn a_custom_facet_cannot_shadow_a_built_in_one() {
    // Two places holding "course" could disagree, and nothing would say which won.
    for key in ["course", "Course", "WEEK", "tags"] {
        let result = Facets::empty().with_custom(key, label("something"));
        assert!(
            result.is_err(),
            "`{key}` is a built-in facet and must be refused as a custom one"
        );
    }
}

#[test]
fn accepts_a_custom_facet_the_person_invented() {
    let facets = Facets::empty()
        .with_custom("lecturer", label("Dr Chen"))
        .unwrap()
        .with_custom("Room", label("B2.14"))
        .unwrap();

    assert_eq!(facets.custom().get("lecturer").unwrap().as_str(), "Dr Chen");
    // Keys are lower-cased, so `Room` and `room` are one facet rather than two.
    assert_eq!(facets.custom().get("room").unwrap().as_str(), "B2.14");
}

#[test]
fn serialises_without_the_fields_that_are_not_set() {
    // A manifest for an untagged lecture should not be full of nulls and empty objects.
    let json = serde_json::to_string(&Facets::empty()).unwrap();
    assert_eq!(json, "{}");

    let only_course = Facets::empty().with_course(label("CS454"));
    let json = serde_json::to_string(&only_course).unwrap();
    assert_eq!(json, r#"{"course":"CS454"}"#);
}

#[test]
fn custom_facets_serialise_in_a_stable_order() {
    // A BTreeMap rather than a HashMap: identical data must produce identical bytes, or
    // every save looks like a change to a sync client.
    let facets = Facets::empty()
        .with_custom("room", label("B2.14"))
        .unwrap()
        .with_custom("lecturer", label("Dr Chen"))
        .unwrap()
        .with_custom("assessment", label("Coursework"))
        .unwrap();

    let first = serde_json::to_string(&facets).unwrap();
    for _ in 0..20 {
        assert_eq!(serde_json::to_string(&facets).unwrap(), first);
    }
    assert!(
        first.find("assessment").unwrap() < first.find("lecturer").unwrap(),
        "keys should serialise in sorted order, got {first}"
    );
}

#[test]
fn survives_a_json_round_trip() {
    let facets = Facets::empty()
        .with_course(label("CS454"))
        .with_week(label("Week 3"))
        .with_tags(vec![label("raft"), label("exam")])
        .with_custom("lecturer", label("Dr Chen"))
        .unwrap();

    let json = serde_json::to_string(&facets).unwrap();
    let parsed: Facets = serde_json::from_str(&json).unwrap();

    assert_eq!(facets, parsed);
}

#[test]
fn reads_a_manifest_written_with_no_facets() {
    let parsed: Facets = serde_json::from_str("{}").unwrap();
    assert_eq!(parsed, Facets::empty());
}

#[test]
fn deserialization_cannot_bypass_label_validation() {
    for json in [
        r#"{"course":""}"#,
        r#"{"course":"   "}"#,
        r#"{"week":"Week\u00003"}"#,
        r#"{"tags":["ok",""]}"#,
    ] {
        let parsed = serde_json::from_str::<Facets>(json);
        assert!(
            parsed.is_err(),
            "stored facets {json} must be rejected on read, got {parsed:?}"
        );
    }
}

#[test]
fn an_unknown_facet_field_is_refused_rather_than_silently_dropped() {
    // Unknown fields are denied so that a typo is reported instead of discarded, and so
    // that any future field addition must bump `schemaVersion` rather than being lost
    // on the next save. `custom` is the sanctioned extension point.
    let parsed = serde_json::from_str::<Facets>(r#"{"corse":"CS454"}"#);
    assert!(parsed.is_err(), "a misspelled facet must be reported");
}

#[test]
fn corrects_a_hand_edited_tag_order_rather_than_refusing_the_file() {
    // Losing access to a lecture because its tags were listed out of order would be a
    // bad trade. The order is fixed instead, and the next save stores it canonically.
    let parsed: Facets = serde_json::from_str(r#"{"tags":["raft","consensus","raft"]}"#).unwrap();

    let fixed = parsed.canonicalised();
    let stored: Vec<&str> = fixed.tags().iter().map(Label::as_str).collect();
    assert_eq!(stored, ["consensus", "raft"]);
}

#[test]
fn validation_catches_a_custom_key_shadowing_a_built_in_facet() {
    // Reachable only from a hand-edited file, since the builder refuses it.
    let parsed: Facets = serde_json::from_str(r#"{"custom":{"course":"CS999"}}"#).unwrap();

    let err = parsed.validate().unwrap_err();
    assert!(matches!(err, CoreError::InvalidName { .. }));
    assert_eq!(err.code(), "ERR_INVALID_NAME");
}
