//! What an import puts on disk, and what it refuses to start.
//!
//! The conversion lifecycle is in `import_conversion.rs`; these are about the file
//! arriving.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

#[path = "support/import_vault.rs"]
mod import_vault;

use std::fs;

use lecture_core::{ConversionState, Fingerprint, fingerprint_hex};

use import_vault::{Fixture, request};

#[test]
fn a_pdf_lands_as_the_document_and_is_ready_at_once() {
    let fixture = Fixture::new();
    let file = fixture.waiting("lecture.pdf", b"%PDF-1.7 a real lecture");

    let outcome = fixture.importer().import(&request(&file), None).unwrap();

    assert_eq!(
        fs::read(fixture.in_bundle("document.pdf")).unwrap(),
        b"%PDF-1.7 a real lecture"
    );
    assert!(
        !fixture.in_bundle("original.pdf").exists(),
        "a PDF is stored once, not twice"
    );

    let source = outcome.manifest.source();
    assert_eq!(source.conversion().state(), ConversionState::NotRequired);
    assert!(source.document_is_ready());
    assert_eq!(source.original(), None);
    assert!(outcome.conversion_error.is_none());
}

#[test]
fn the_fingerprint_recorded_is_the_fingerprint_of_what_landed() {
    let fixture = Fixture::new();
    let bytes = b"%PDF-1.7 a real lecture";
    let file = fixture.waiting("lecture.pdf", bytes);

    let outcome = fixture.importer().import(&request(&file), None).unwrap();

    assert_eq!(
        outcome
            .manifest
            .source()
            .document_fingerprint()
            .map(Fingerprint::as_hex),
        Some(fingerprint_hex(bytes))
    );
}

#[test]
fn a_file_larger_than_one_chunk_copies_and_fingerprints_identically() {
    // The copy is streamed in 64 KiB pieces, so this is the chunk-boundary property --
    // already unit-tested on `Fingerprinter` -- holding through real file I/O.
    let fixture = Fixture::new();
    let bytes: Vec<u8> = (0..400_000_u32).map(|n| (n % 251) as u8).collect();
    let file = fixture.waiting("big.pdf", &bytes);

    let outcome = fixture.importer().import(&request(&file), None).unwrap();

    assert_eq!(fs::read(fixture.in_bundle("document.pdf")).unwrap(), bytes);
    assert_eq!(
        outcome
            .manifest
            .source()
            .document_fingerprint()
            .map(Fingerprint::as_hex),
        Some(fingerprint_hex(&bytes)),
        "a streamed fingerprint must equal the whole-file one"
    );
}

#[test]
fn a_format_nexus_cannot_import_is_refused_before_anything_is_written() {
    let fixture = Fixture::new();
    let file = fixture.waiting("notes.txt", b"not a lecture document");

    let error = fixture
        .importer()
        .import(&request(&file), None)
        .unwrap_err();

    assert_eq!(error.code(), "ERR_UNSUPPORTED_DOCUMENT_FORMAT");
    assert!(
        !fixture.vault.join("cs454").exists(),
        "nothing should be created for an import that cannot happen"
    );
}

#[test]
fn a_file_with_no_extension_at_all_is_refused_the_same_way() {
    let fixture = Fixture::new();
    let file = fixture.waiting("lecture", b"who knows");

    assert_eq!(
        fixture
            .importer()
            .import(&request(&file), None)
            .unwrap_err()
            .code(),
        "ERR_UNSUPPORTED_DOCUMENT_FORMAT"
    );
}
