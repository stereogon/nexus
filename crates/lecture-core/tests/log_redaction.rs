//! The privacy contract for the log, as a test.
//!
//! `CLAUDE.md` §1.2 says study material is never logged verbatim into diagnostics, and §4
//! narrows what may go in to codes and timings. The risk is not the obvious one — nobody
//! is about to log `notes.md` — it is that an error's `Display` text interpolates a
//! **path**, and a path contains folder names, which contain course and lecture titles.
//! `StoredFileUnreadable` is the subtler case: its detail is a serde message, and those
//! quote the offending JSON back.
//!
//! Two groups, because the types already do half the work. A variant whose fields are all
//! `&'static str` or numbers cannot carry what someone typed, and the compiler enforces
//! that. The variants holding `String` are where the promise has to be tested, so each is
//! built around a sentinel and checked twice: that the sentinel reaches `Display`, proving
//! the error really carries it, and that it reaches none of the three things a log line
//! may contain.
//!
//! Written this way so that adding a variant whose remediation interpolates its detail
//! fails here rather than shipping. It guards a promise rather than a behaviour, which is
//! rare in this suite.
//!
//! # What actually enforces this, and what the test adds
//!
//! The real guarantee is the type system. `remediation` returns `&'static str`, so it
//! *cannot* interpolate a path however carelessly a variant is added, and `code`'s match
//! is exhaustive, so a new variant will not compile without both. This file cannot
//! enumerate variants from outside the crate — `CoreError` is `#[non_exhaustive]` — so it
//! does not claim to be exhaustive. What it adds is a check that the two lists below are
//! grouped correctly, and a loud failure if `remediation`'s signature is ever widened to
//! `String`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::io;

use lecture_core::{BackupOutcome, CoreError};

/// Stands in for a lecture title, which is exactly the thing that must not be logged.
const SENTINEL: &str = "Treatment-Resistant-Depression";

/// Every variant with a `String` field, each seeded with [`SENTINEL`].
fn variants_carrying_free_text() -> Vec<CoreError> {
    let path = format!("/Users/someone/StudyVault/{SENTINEL}/manifest.json");

    vec![
        CoreError::InvalidName {
            name: SENTINEL.to_owned(),
            reason: "it is a test",
        },
        CoreError::InvalidRelativePath {
            path: path.clone(),
            reason: "it is a test",
        },
        CoreError::RelativePathTooDeep {
            path: path.clone(),
            depth: 9,
            max: 8,
        },
        CoreError::VaultRootUnusable {
            path: path.clone(),
            reason: "it is a test",
        },
        CoreError::SymlinkRefused { path: path.clone() },
        CoreError::PathEscapesVault { path: path.clone() },
        CoreError::Io {
            operation: "read",
            path: path.clone(),
            source: io::Error::from(io::ErrorKind::PermissionDenied),
        },
        CoreError::InvalidTimestamp {
            value: SENTINEL.to_owned(),
            reason: "it is a test",
        },
        // Two ways in: the detail is a serde message, and those quote the offending JSON
        // back at you, while `BackupOutcome::Saved` carries a path of its own.
        CoreError::StoredFileUnreadable {
            file: "manifest.json",
            detail: format!("invalid type: string \"{SENTINEL}\""),
            backup: BackupOutcome::Saved(format!("{path}.bak")),
        },
        CoreError::NameAlreadyTaken { path },
        CoreError::InvalidZoom {
            value: SENTINEL.to_owned(),
        },
        CoreError::InvalidPageOffset {
            value: SENTINEL.to_owned(),
        },
        CoreError::DuplicateAnnotationId {
            id: SENTINEL.to_owned(),
        },
        CoreError::InvalidOrderKey {
            key: SENTINEL.to_owned(),
            reason: "it is a test",
        },
        CoreError::OrderKeysNotAscending {
            lower: SENTINEL.to_owned(),
            upper: SENTINEL.to_owned(),
        },
        CoreError::OrderSpaceExhausted {
            bound: SENTINEL.to_owned(),
        },
    ]
}

/// Variants whose fields are all numbers or `&'static str`, so no `String` can get in.
fn variants_without_free_text() -> Vec<CoreError> {
    vec![
        CoreError::InvalidCoordinate {
            field: "x",
            value: 1.5,
        },
        CoreError::RectOutOfBounds {
            field: "right",
            reach: 1.2,
        },
        CoreError::InvalidManifest {
            reason: "it is a test",
        },
        CoreError::SchemaVersionUnsupported {
            file: "manifest.json",
            found: 9,
            oldest_readable: 1,
            current: 2,
        },
        CoreError::InvalidPageNumber { number: 0 },
        CoreError::HomeDirectoryUnavailable,
        CoreError::InvalidAnnotation {
            reason: "it is a test",
        },
    ]
}

/// The contract.
#[test]
fn nothing_a_person_named_can_reach_a_log_line() {
    for error in variants_carrying_free_text() {
        let code = error.code();
        let remediation = error.remediation();
        let digest = error.log_digest();

        assert!(
            !code.contains(SENTINEL),
            "{code} leaked the sentinel into its code"
        );
        assert!(
            !remediation.contains(SENTINEL),
            "{code} leaked the sentinel into its remediation: {remediation}"
        );
        assert!(
            !digest.contains(SENTINEL),
            "{code} leaked the sentinel into its digest: {digest}"
        );
    }
}

/// Guards the test above against passing for the wrong reason.
#[test]
fn every_tested_variant_really_does_carry_the_sentinel() {
    // If an error stopped interpolating its detail, the test above would pass while
    // proving nothing at all.
    for error in variants_carrying_free_text() {
        let shown = error.to_string();

        assert!(
            shown.contains(SENTINEL),
            "{} does not carry its detail, so testing it proves nothing: {shown}",
            error.code()
        );
    }
}

/// The second group is excluded by the type system, not by being overlooked.
#[test]
fn variants_without_a_string_field_cannot_carry_anything_private() {
    for error in variants_without_free_text() {
        let shown = error.to_string();

        assert!(
            !shown.contains('/'),
            "{} shows something path-like, so it belongs in the tested group: {shown}",
            error.code()
        );
        assert!(!shown.contains(SENTINEL));
    }
}

#[test]
fn a_remediation_cannot_interpolate_anything_by_construction() {
    // `remediation` returns `&'static str`, so the compiler already guarantees this. The
    // test exists so that changing the signature to `String` fails loudly here.
    for error in variants_carrying_free_text() {
        let remediation: &'static str = error.remediation();

        assert!(!remediation.is_empty(), "{}", error.code());
    }
}

#[test]
fn the_same_failure_digests_the_same_way_and_a_different_one_does_not() {
    // The whole point of a digest rather than nothing: a log has to tell a repeated
    // failure from two separate ones.
    let one = CoreError::SymlinkRefused {
        path: "/vault/a".to_owned(),
    };
    let same = CoreError::SymlinkRefused {
        path: "/vault/a".to_owned(),
    };
    let other = CoreError::SymlinkRefused {
        path: "/vault/b".to_owned(),
    };

    assert_eq!(one.log_digest(), same.log_digest());
    assert_ne!(one.log_digest(), other.log_digest());
}

#[test]
fn two_different_failures_about_the_same_path_digest_differently() {
    // Otherwise a log could not tell "this folder is an alias" from "this folder escapes
    // the vault", which need different answers.
    let path = "/vault/a".to_owned();

    assert_ne!(
        CoreError::SymlinkRefused { path: path.clone() }.log_digest(),
        CoreError::PathEscapesVault { path }.log_digest()
    );
}

#[test]
fn a_digest_is_fixed_width_hex_so_log_lines_stay_readable() {
    for error in variants_carrying_free_text()
        .into_iter()
        .chain(variants_without_free_text())
    {
        let digest = error.log_digest();

        assert_eq!(digest.len(), 16, "{}", error.code());
        assert!(
            digest.chars().all(|c| c.is_ascii_hexdigit()),
            "{}: {digest}",
            error.code()
        );
    }
}

#[test]
fn a_code_is_shaped_so_a_log_can_be_grepped_and_parsed() {
    for error in variants_carrying_free_text()
        .into_iter()
        .chain(variants_without_free_text())
    {
        let code = error.code();

        assert!(code.starts_with("ERR_"), "{code}");
        assert!(
            code.chars().all(|c| c.is_ascii_uppercase() || c == '_'),
            "{code} should be greppable without escaping"
        );
    }
}

/// Codes are not one per variant, and that is on purpose.
#[test]
fn two_geometry_failures_share_one_code_deliberately() {
    // A person does not care whether a rectangle's origin or its far edge was out of
    // range -- both mean the same thing and take the same action -- so they share a code.
    // Asserted here so the grouping cannot be undone by accident, having first caught me
    // out: I wrote a test asserting codes were unique per variant, and the code was right
    // while the test was wrong.
    assert_eq!(
        CoreError::InvalidCoordinate {
            field: "x",
            value: 1.5,
        }
        .code(),
        CoreError::RectOutOfBounds {
            field: "right",
            reach: 1.2,
        }
        .code()
    );

    // The digests still differ, so a log can tell them apart when it needs to.
    assert_ne!(
        CoreError::InvalidCoordinate {
            field: "x",
            value: 1.5,
        }
        .log_digest(),
        CoreError::RectOutOfBounds {
            field: "right",
            reach: 1.2,
        }
        .log_digest()
    );
}
