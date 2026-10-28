//! Contract tests for content fingerprints.
//!
//! Two of these matter more than the rest. [`chunk_boundaries_do_not_change_the_result`]
//! is what makes streaming a large PDF equivalent to reading the whole thing, which is
//! the only reason the streaming API exists. And
//! [`the_algorithm_is_pinned_to_known_values`] is a regression guard with real stakes: a
//! fingerprint is written into `manifest.json` and a vault key is a directory name on
//! disk, so a refactor that quietly changed the arithmetic would orphan every stored
//! value and make every "has this changed?" answer yes.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{CoreError, Fingerprint, Fingerprinter, fingerprint, fingerprint_hex};

#[test]
fn chunk_boundaries_do_not_change_the_result() {
    let whole = b"abcdef";
    let splits: &[&[&[u8]]] = &[
        &[b"abcdef"],
        &[b"abc", b"def"],
        &[b"a", b"b", b"c", b"d", b"e", b"f"],
        &[b"", b"abcdef", b""],
        &[b"abcde", b"f"],
    ];

    for split in splits {
        let mut hasher = Fingerprinter::new();
        for chunk in *split {
            hasher.write(chunk);
        }

        assert_eq!(
            hasher.finish(),
            Fingerprint::of(whole),
            "a document read in chunks must fingerprint as itself: {split:?}"
        );
    }
}

/// If this test fails, every fingerprint already on disk has become wrong.
#[test]
fn the_algorithm_is_pinned_to_known_values() {
    // FNV-1a 64-bit, computed independently rather than recorded from this code's own
    // output -- otherwise the test only proves the code agrees with itself.
    assert_eq!(fingerprint_hex(b""), "cbf29ce484222325");
    assert_eq!(fingerprint_hex(b"nexus"), "98ef1c1e2079a078");
    assert_eq!(fingerprint_hex(b"a"), "af63dc4c8601ec8c");
    assert_eq!(fingerprint_hex(b"abcdef"), "d80bda3fbe244a0a");
}

#[test]
fn an_empty_file_has_a_fingerprint_rather_than_no_fingerprint() {
    // An empty document is a real thing to import, and "no bytes" must be a value that
    // compares equal to itself rather than a gap in the record.
    let empty = Fingerprint::of(b"");

    assert_eq!(empty, Fingerprint::of(b""));
    assert_ne!(empty, Fingerprint::of(b"\0"));
}

#[test]
fn different_contents_fingerprint_differently() {
    let cases: &[&[u8]] = &[b"a", b"b", b"ab", b"ba", b"", b"\0", b"A"];

    for (i, left) in cases.iter().enumerate() {
        for right in cases.iter().skip(i + 1) {
            assert_ne!(
                Fingerprint::of(left),
                Fingerprint::of(right),
                "{left:?} and {right:?} must not collide"
            );
        }
    }
}

#[test]
fn survives_the_round_trip_through_its_stored_form() {
    for bytes in [b"".as_slice(), b"nexus", b"a longer run of document bytes"] {
        let original = Fingerprint::of(bytes);
        let parsed = Fingerprint::parse(&original.as_hex()).expect("its own form must parse");

        assert_eq!(original, parsed);
    }
}

#[test]
fn is_always_written_as_sixteen_characters() {
    // A fingerprint whose leading zeros were dropped would be a different string for the
    // same value, and string comparison is how two of these are compared on disk.
    let small = Fingerprint::parse("0000000000000001").unwrap();

    assert_eq!(small.as_hex(), "0000000000000001");
    assert_eq!(small.as_hex().len(), 16);
}

#[test]
fn refuses_anything_that_is_not_a_fingerprint() {
    let rejected = [
        "",
        "cbf29ce48422232",    // one short
        "cbf29ce4842223250",  // one long
        "CBF29CE484222325",   // upper case is a different string for the same value
        "cbf29ce48422232g",   // not hex
        "0xcbf29ce484222325", // prefixed
        " cbf29ce484222325",  // padded
        "cbf29ce4-8422-2325", // punctuated
    ];

    for raw in rejected {
        let err = Fingerprint::parse(raw).unwrap_err();

        assert!(
            matches!(err, CoreError::InvalidFingerprint { .. }),
            "{raw:?} should be refused as a fingerprint, got: {err}"
        );
        assert_eq!(err.code(), "ERR_INVALID_FINGERPRINT");
        assert!(err.remediation().contains("untouched"));
    }
}

#[test]
fn a_hand_edited_fingerprint_cannot_reach_a_manifest() {
    // The whole reason this is a type: JSON is where a bad value would arrive from.
    let err = serde_json::from_str::<Fingerprint>(r#""not a fingerprint""#).unwrap_err();

    assert!(
        err.to_string().contains("fingerprint"),
        "the cause should name what was wrong, got: {err}"
    );
}

#[test]
fn the_hex_helper_and_the_type_agree() {
    // Two spellings of the same thing exist because the log and the vault key want a
    // string while a manifest wants a value. They must not drift apart.
    for bytes in [b"".as_slice(), b"nexus", b"x"] {
        assert_eq!(Fingerprint::of(bytes).as_hex(), fingerprint_hex(bytes));
        assert_eq!(
            fingerprint_hex(bytes),
            format!("{:016x}", fingerprint(bytes))
        );
    }
}

#[test]
fn a_fresh_fingerprinter_is_the_same_as_a_default_one() {
    assert_eq!(
        Fingerprinter::new().finish(),
        Fingerprinter::default().finish()
    );
}
