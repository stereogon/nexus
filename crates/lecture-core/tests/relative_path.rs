//! Contract tests for [`RelativePath`].
//!
//! The headline property is the containment one: for *any* input this type accepts,
//! joining it onto a root cannot produce a location outside that root.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::path::{Component, Path};

use lecture_core::{CoreError, MAX_BUNDLE_DEPTH, MAX_DEPTH, RelativePath, Slug};

fn parse(raw: &str) -> RelativePath {
    RelativePath::parse(raw).unwrap_or_else(|e| panic!("`{raw}` should parse: {e}"))
}

#[test]
fn accepts_paths_a_real_vault_would_hold() {
    for raw in [
        "distributed-systems",
        "distributed-systems/week-03",
        "distributed-systems/week-03/raft-consensus",
        "cs454/module-2/week-03/lecture-04/assets",
        "assets/figure.png",
    ] {
        assert!(
            RelativePath::parse(raw).is_ok(),
            "`{raw}` should be a usable vault path"
        );
    }
}

/// The property the type exists for.
#[test]
fn no_accepted_path_can_escape_the_root() {
    // Every one of these either fails to parse or resolves inside the root. There is no
    // third outcome, and that is the whole guarantee.
    let root = Path::new("/Users/someone/StudyVault");

    let candidates = [
        "a",
        "a/b",
        "a/b/c/d/e",
        "..",
        "../..",
        "a/../../b",
        "/etc/passwd",
        "a/./b",
        "./a",
        "a//b",
        "a/",
        "",
        "....//....//etc",
        "a/..%2f..%2fb",
        "~/secrets",
        "a/b/../../../../../../etc",
    ];

    let mut accepted = 0;
    for raw in candidates {
        let Ok(path) = RelativePath::parse(raw) else {
            continue;
        };
        accepted += 1;

        let resolved = path.join_onto(root);

        assert!(
            resolved.starts_with(root),
            "`{raw}` parsed and then resolved to `{}`, outside the root",
            resolved.display()
        );
        assert!(
            !resolved
                .components()
                .any(|c| matches!(c, Component::ParentDir)),
            "`{raw}` resolved to `{}`, which contains a `..` component",
            resolved.display()
        );
    }

    // Without this the test would pass vacuously if the parser started refusing
    // everything, asserting a containment property over an empty set.
    assert!(
        accepted >= 4,
        "only {accepted} candidates parsed, so containment was barely exercised"
    );
}

#[test]
fn rejects_traversal_in_every_spelling() {
    for raw in [
        "..",
        "../etc",
        "a/..",
        "a/../b",
        "a/b/../../..",
        ".",
        "./a",
        "a/./b",
    ] {
        assert!(RelativePath::parse(raw).is_err(), "`{raw}` must be refused");
    }
}

#[test]
fn rejects_absolute_paths() {
    for raw in ["/etc/passwd", "/", "/Users/someone/StudyVault"] {
        let err = RelativePath::parse(raw).unwrap_err();
        assert_eq!(err.code(), "ERR_INVALID_RELATIVE_PATH", "for `{raw}`");
    }
}

#[test]
fn rejects_empty_and_malformed_paths() {
    for raw in ["", "a//b", "a/", "a/b//"] {
        let err = RelativePath::parse(raw).unwrap_err();
        assert_eq!(err.code(), "ERR_INVALID_RELATIVE_PATH", "for `{raw}`");
    }
}

#[test]
fn reports_the_offending_segment_rather_than_a_generic_failure() {
    // A person who typed a colon should be told about the colon, not handed
    // "invalid path".
    let err = RelativePath::parse("week-03/notes:draft").unwrap_err();

    assert_eq!(err.code(), "ERR_INVALID_NAME");
    assert!(
        err.to_string().contains("notes:draft"),
        "error should name the segment at fault, got: {err}"
    );
}

#[test]
fn enforces_the_depth_cap() {
    let at_cap = "a/b/c/d/e/f/g/h";
    let past_cap = "a/b/c/d/e/f/g/h/i";

    assert_eq!(parse(at_cap).depth(), MAX_DEPTH);

    let err = RelativePath::parse(past_cap).unwrap_err();
    assert_eq!(err.code(), "ERR_RELATIVE_PATH_TOO_DEEP");
    assert!(matches!(
        err,
        CoreError::RelativePathTooDeep {
            depth: 9,
            max: MAX_DEPTH,
            ..
        }
    ));
}

#[test]
fn a_hostile_depth_is_refused_without_validating_every_segment() {
    // Guards the early-exit: 10,000 segments must be one rejection, not 10,000 parses.
    let deep = vec!["a"; 10_000].join("/");
    let err = RelativePath::parse(&deep).unwrap_err();

    assert_eq!(err.code(), "ERR_RELATIVE_PATH_TOO_DEEP");
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
