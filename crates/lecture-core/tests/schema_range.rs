//! Contract tests for the span of schema versions a build will read.
//!
//! The span exists so an *older* file can be upgraded rather than refused. Refusing one
//! would be wrong in a way that is easy to miss: the file is not damaged, and the person
//! holding it cannot do anything about the refusal. A *newer* file is the opposite case
//! and must still be refused, untouched, because this build cannot know what it says.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{
    ANNOTATIONS_SCHEMA, CURRENT_SCHEMA_VERSION, CoreError, MANIFEST_SCHEMA,
    OLDEST_READABLE_SCHEMA_VERSION, SchemaRange,
};

#[test]
fn reads_everything_from_the_oldest_readable_version_to_the_current_one() {
    let range = SchemaRange::new(1, 3);

    assert!(range.accepts(1));
    assert!(range.accepts(2));
    assert!(range.accepts(3));
}

#[test]
fn refuses_versions_on_either_side_of_the_span() {
    let range = SchemaRange::new(2, 3);

    assert!(!range.accepts(1), "below the oldest readable version");
    assert!(!range.accepts(4), "newer than this build");
    assert!(!range.accepts(0), "a hand-edited zero is not a version");
}

#[test]
fn only_a_readable_older_version_needs_upgrading() {
    let range = SchemaRange::new(1, 3);

    assert!(range.needs_upgrade(1));
    assert!(range.needs_upgrade(2));
    assert!(
        !range.needs_upgrade(3),
        "the current version is already current"
    );
    assert!(
        !range.needs_upgrade(4),
        "an unreadable version is refused, not upgraded"
    );
    assert!(
        !range.needs_upgrade(0),
        "a version outside the span cannot be upgraded either"
    );
}

#[test]
fn an_exact_range_accepts_only_its_own_version() {
    // For derived files, where an unrecognised version is discarded and rebuilt rather
    // than migrated, so there is nothing for a span to express.
    let range = SchemaRange::exact(1);

    assert!(range.accepts(1));
    assert!(!range.accepts(0));
    assert!(!range.accepts(2));
    assert!(!range.needs_upgrade(1));
    assert_eq!(range.oldest_readable(), range.current());
}

#[test]
fn the_rejection_carries_the_span_it_was_judged_against() {
    // So the message can say what this build reads rather than only that the file is
    // wrong, and so no call site can fill the fields in itself and get them crossed.
    let err = SchemaRange::new(1, 2).reject("manifest.json", 7);

    match err {
        CoreError::SchemaVersionUnsupported {
            file,
            found,
            oldest_readable,
            current,
        } => {
            assert_eq!(file, "manifest.json");
            assert_eq!(found, 7);
            assert_eq!(oldest_readable, 1);
            assert_eq!(current, 2);
        }
        other => panic!("wrong variant: {other:?}"),
    }
}

#[test]
fn the_rejection_explains_itself_without_claiming_the_file_is_newer() {
    // It may well be older. The remediation used to say "saved by a newer version",
    // which is a confident lie for a hand-edited version 0.
    let err = SchemaRange::new(1, 2).reject("manifest.json", 0);

    assert_eq!(err.code(), "ERR_SCHEMA_VERSION_UNSUPPORTED");
    assert!(err.remediation().contains("does not recognise"));
    assert!(
        err.remediation().contains("untouched"),
        "the promise that nothing was written is the part that matters"
    );
}

#[test]
fn the_manifest_span_matches_the_versions_it_documents() {
    assert_eq!(MANIFEST_SCHEMA.current(), CURRENT_SCHEMA_VERSION);
    assert_eq!(
        MANIFEST_SCHEMA.oldest_readable(),
        OLDEST_READABLE_SCHEMA_VERSION
    );
    assert!(
        MANIFEST_SCHEMA.accepts(1),
        "version 1 manifests exist on disk and must stay readable"
    );
    assert!(MANIFEST_SCHEMA.needs_upgrade(1));
}

#[test]
fn the_two_file_formats_version_independently() {
    // Coupling them would force a migration of one whenever the other grew a field.
    assert_eq!(ANNOTATIONS_SCHEMA.current(), 1);
    assert_ne!(ANNOTATIONS_SCHEMA.current(), MANIFEST_SCHEMA.current());
    assert!(
        !ANNOTATIONS_SCHEMA.accepts(MANIFEST_SCHEMA.current()),
        "a manifest version must not be mistaken for an annotations version"
    );
}
