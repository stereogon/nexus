//! Contract tests for [`RelativePath`]: what it accepts, and what it refuses.
//!
//! The load-bearing test is `no_accepted_path_can_escape_the_root`. Containment here is
//! **lexical** — a path made only of `Slug`s cannot walk upward — and that property is
//! what lets the storage layer treat any `RelativePath` as already safe.
//!
//! Navigation, composition and serialisation live in `relative_path_navigation.rs`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::path::{Component, Path};

use lecture_core::{CoreError, MAX_DEPTH, RelativePath};

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
