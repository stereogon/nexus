//! Contract tests for navigating and composing a [`RelativePath`].
//!
//! Joining onto a base, walking up, appending a segment, ordering, and surviving a
//! round trip through JSON. The depth-headroom test here is the regression guard for a
//! real bug: the nesting cap and the path cap are two different numbers.
//!
//! What a path accepts and refuses lives in `relative_path.rs`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::path::Path;

use lecture_core::{MAX_BUNDLE_DEPTH, MAX_DEPTH, RelativePath, Slug};

fn parse(raw: &str) -> RelativePath {
    RelativePath::parse(raw).unwrap_or_else(|e| panic!("`{raw}` should parse: {e}"))
}

#[test]
fn join_onto_builds_the_location_a_bundle_would_live_at() {
    let root = Path::new("/vault");
    let path = parse("cs454/week-03/raft-consensus");

    assert_eq!(
        path.join_onto(root),
        Path::new("/vault/cs454/week-03/raft-consensus")
    );
}

#[test]
fn join_onto_does_not_require_the_path_to_exist() {
    // New bundles are located before they are created, so this must be pure.
    let path = parse("brand-new/lecture");
    let resolved = path.join_onto(Path::new("/definitely/not/a/real/place"));

    assert!(resolved.starts_with("/definitely/not/a/real/place"));
    assert!(
        !resolved.exists(),
        "the test fixture should not exist on disk"
    );
}

#[test]
fn exposes_its_parts() {
    let path = parse("cs454/week-03/raft-consensus");

    assert_eq!(path.name().as_str(), "raft-consensus");
    assert_eq!(path.depth(), 3);
    assert_eq!(
        path.segments().map(Slug::as_str).collect::<Vec<_>>(),
        ["cs454", "week-03", "raft-consensus"]
    );
}

#[test]
fn walks_up_to_the_root_and_stops() {
    let path = parse("cs454/week-03/raft-consensus");

    let parent = path.parent().expect("has a parent");
    assert_eq!(parent.to_string(), "cs454/week-03");

    let grandparent = parent.parent().expect("has a grandparent");
    assert_eq!(grandparent.to_string(), "cs454");

    assert!(
        grandparent.parent().is_none(),
        "a root-level path has no parent"
    );
}

#[test]
fn appends_a_child_and_respects_the_cap() {
    let path = parse("a/b/c/d/e/f/g");
    let name = Slug::parse("h").unwrap();

    let child = path.child(name.clone()).unwrap();
    assert_eq!(child.to_string(), "a/b/c/d/e/f/g/h");
    assert_eq!(child.depth(), MAX_DEPTH);

    let err = child.child(name).unwrap_err();
    assert_eq!(err.code(), "ERR_RELATIVE_PATH_TOO_DEEP");
}

/// The regression guard for a real bug.
#[test]
fn the_path_cap_leaves_room_for_a_deep_bundle_to_address_its_own_files() {
    // These are two different limits, and this test exists because they were once one
    // number. A lecture may nest MAX_BUNDLE_DEPTH levels deep; its files then need
    // further segments on top. With the caps conflated, the deepest legal lecture could
    // not name its own manifest.json, so the app could not open it.
    let deepest_bundle = "a/b/c/d/e";
    assert_eq!(deepest_bundle.split('/').count(), MAX_BUNDLE_DEPTH);

    for inside in ["manifest.json", "notes.md", "source/document.pdf"] {
        let full = format!("{deepest_bundle}/{inside}");
        assert!(
            RelativePath::parse(&full).is_ok(),
            "`{full}` is a legitimate vault path and must be accepted"
        );
    }
}

#[test]
fn a_path_always_names_something() {
    // Non-emptiness is structural, so there is no constructor that produces a path
    // naming nothing.
    assert!(
        RelativePath::from_segments(Vec::new()).is_err(),
        "an empty segment list must be refused"
    );

    let root_level = RelativePath::root_level(Slug::parse("cs454").unwrap());
    assert_eq!(root_level.depth(), 1);
    assert_eq!(root_level.name().as_str(), "cs454");
    assert!(root_level.parent().is_none());
}

#[test]
fn errors_carry_a_code_and_plain_language_remediation() {
    let too_deep = RelativePath::parse("a/b/c/d/e/f/g/h/i").unwrap_err();
    assert!(too_deep.remediation().contains("Nothing was moved"));

    let invalid = RelativePath::parse("/etc").unwrap_err();
    assert!(invalid.remediation().contains("Nothing was created"));
}

#[test]
fn survives_a_json_round_trip_as_a_plain_string() {
    // manifest.json stores `"path": "cs454/week-03"`, not a nested object.
    let path = parse("cs454/week-03");

    let json = serde_json::to_string(&path).unwrap();
    assert_eq!(json, r#""cs454/week-03""#);

    let parsed: RelativePath = serde_json::from_str(&json).unwrap();
    assert_eq!(path, parsed);
}

#[test]
fn deserialization_cannot_bypass_validation() {
    // A hand-edited manifest must fail to load rather than hand the storage layer a
    // path that points out of the vault.
    for raw in [
        r#""../../etc/passwd""#,
        r#""/etc/passwd""#,
        r#""""#,
        r#""a/b/c/d/e/f/g/h/i""#,
        r#""a//b""#,
        r#""week/notes:draft""#,
    ] {
        let parsed = serde_json::from_str::<RelativePath>(raw);
        assert!(
            parsed.is_err(),
            "stored path {raw} must be rejected on read, got {parsed:?}"
        );
    }
}

#[test]
fn orders_by_path_rather_than_by_field_layout() {
    // A derived `Ord` compares `parents` then `name`, which puts every root-level path
    // ahead of every nested one -- so `quick-note` would sort before `cs454/raft`.
    // Comparing the whole segment sequence gives the order a person expects.
    let mut paths = [
        parse("quick-note"),
        parse("y1/cs454/paxos"),
        parse("cs454/raft"),
        parse("cs454/assets/figure.png"),
        parse("zz-last"),
    ];
    paths.sort();

    assert_eq!(
        paths.iter().map(ToString::to_string).collect::<Vec<_>>(),
        [
            "cs454/assets/figure.png",
            "cs454/raft",
            "quick-note",
            "y1/cs454/paxos",
            "zz-last",
        ]
    );
}
