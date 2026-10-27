//! Contract tests for [`VaultIndex`], the shape of `.nexus/index.json`.
//!
//! The behaviour worth pinning is mostly about *not* trusting this file: a version it
//! does not recognise and a field it does not know are both refused, so a bad cache
//! becomes an empty one at the boundary rather than a wrong lecture list further in.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{
    CACHE_DIR_NAME, Conversion, INDEX_FILE_NAME, INDEX_SCHEMA_VERSION, Label, LectureBundle,
    Manifest, OrderKey, RelativePath, Slug, Source, Timestamp, VaultIndex, cache_dir_segment,
};

fn bundle(directory: &str, title: &str) -> LectureBundle {
    let source = Source::new(
        RelativePath::parse("source/document.pdf").unwrap(),
        None,
        Conversion::not_required(),
    )
    .unwrap();

    LectureBundle::new(
        RelativePath::parse(directory).unwrap(),
        Manifest::new(
            Label::parse(title).unwrap(),
            OrderKey::first(),
            source,
            Timestamp::parse("2026-10-27T16:00:00Z").unwrap(),
        ),
    )
}

#[test]
fn an_empty_index_is_the_absence_of_a_cache() {
    let index = VaultIndex::empty();

    assert!(index.is_empty());
    assert_eq!(index.len(), 0);
}

#[test]
fn describes_the_bundles_a_scan_found() {
    let index = VaultIndex::of(&[
        bundle("cs454/raft", "Raft Consensus"),
        bundle("quick-note", "A Quick Note"),
    ]);

    assert_eq!(index.len(), 2);
    let titles: Vec<&str> = index.entries().iter().map(|e| e.title().as_str()).collect();
    assert_eq!(titles, ["Raft Consensus", "A Quick Note"]);
}

#[test]
fn orders_entries_by_path_so_rewriting_an_unchanged_index_changes_no_bytes() {
    let one = VaultIndex::of(&[
        bundle("zz-last", "Last"),
        bundle("aa-first", "First"),
        bundle("mm-middle", "Middle"),
    ]);
    let other = VaultIndex::of(&[
        bundle("mm-middle", "Middle"),
        bundle("zz-last", "Last"),
        bundle("aa-first", "First"),
    ]);

    assert_eq!(one, other);
    assert_eq!(
        serde_json::to_string(&one).unwrap(),
        serde_json::to_string(&other).unwrap()
    );
}

#[test]
fn survives_a_json_round_trip() {
    let index = VaultIndex::of(&[
        bundle("cs454/raft", "Raft Consensus"),
        bundle("cs454/paxos", "Paxos"),
    ]);

    let json = serde_json::to_string(&index).unwrap();
    let back: VaultIndex = serde_json::from_str(&json).unwrap();

    assert_eq!(back, index);
}

#[test]
fn records_the_schema_version_it_was_written_at() {
    let json = serde_json::to_value(VaultIndex::empty()).unwrap();

    assert_eq!(
        json.get("schemaVersion"),
        Some(&serde_json::Value::from(INDEX_SCHEMA_VERSION))
    );
}

#[test]
fn refuses_a_version_it_does_not_know_so_the_caller_rebuilds() {
    let json = format!(
        r#"{{ "schemaVersion": {}, "entries": [] }}"#,
        INDEX_SCHEMA_VERSION + 1
    );

    let result: Result<VaultIndex, _> = serde_json::from_str(&json);

    assert!(result.is_err(), "a newer cache must not be read as empty");
}

#[test]
fn refuses_a_field_it_does_not_know() {
    // A hand-edited or future field means this file is not what this build thinks it
    // is, and guessing is worse than rebuilding.
    let json = r#"{ "schemaVersion": 1, "entries": [], "lastScanned": "yesterday" }"#;

    assert!(serde_json::from_str::<VaultIndex>(json).is_err());
}

#[test]
fn an_absent_entries_list_reads_as_empty() {
    // Forward tolerance in the one direction that is safe: no entries is a valid state,
    // so a file missing the key means the same thing as a file with an empty list.
    let index: VaultIndex = serde_json::from_str(r#"{ "schemaVersion": 1 }"#).unwrap();

    assert!(index.is_empty());
}

/// The constant has to be expressible as a path segment, or nothing can be cached.
#[test]
fn the_cache_directory_name_is_a_usable_internal_segment() {
    let segment = cache_dir_segment().expect("the cache directory must be addressable");

    assert_eq!(segment.as_str(), CACHE_DIR_NAME);
    assert_eq!(
        Slug::internal(INDEX_FILE_NAME).unwrap().as_str(),
        "index.json"
    );
}

/// Pins the distinction the `internal` constructor exists for.
#[test]
fn a_hidden_name_is_refused_for_user_input_and_allowed_for_the_app_itself() {
    assert!(
        Slug::parse(CACHE_DIR_NAME).is_err(),
        "a person's folder must not be hidden"
    );
    assert!(
        Slug::internal(CACHE_DIR_NAME).is_ok(),
        "the app's own cache is hidden on purpose"
    );
}

/// Lifting the leading-dot rule must not lift anything that keeps a path contained.
#[test]
fn the_internal_constructor_still_refuses_everything_unsafe() {
    for unsafe_name in [
        ".",
        "..",
        "a/b",
        "a\\b",
        "",
        "   ",
        "trailing ",
        "trailing.",
        "-leading",
        "con",
        "with\u{0}null",
        "with\u{200B}zero-width",
    ] {
        assert!(
            Slug::internal(unsafe_name).is_err(),
            "Slug::internal must still refuse {unsafe_name:?} — only the \
             hidden-from-Finder rule is lifted"
        );
    }
}
