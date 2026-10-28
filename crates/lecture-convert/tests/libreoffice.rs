//! Contract tests for the `LibreOffice` adapter, driven by a stub `soffice`.
//!
//! The ones that matter most are the three where the converter **reports success and has
//! not produced a usable PDF**. `LibreOffice` really does exit 0 having written nothing,
//! and trusting the exit status would record a `Ready` conversion pointing at a file that
//! is not there — a lecture that imports cleanly and cannot be opened.
//!
//! What these cannot tell us is whether `LibreOffice` itself behaves as assumed; it is
//! not installed here. That is covered by one `#[ignore]`d test which says so, and by
//! `command_arguments` being asserted exactly, since the argument list is the part a real
//! `soffice` would reject.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

#[path = "support/stub.rs"]
mod stub;
#[path = "support/vault.rs"]
mod vault;

use std::fs;
use std::path::{Path, PathBuf};

use lecture_convert::{
    CONVERTER_LABEL, LibreOfficeConverter, SOFFICE_BUNDLE_PATH, command_arguments,
};
use lecture_core::{
    ConversionRequest, CoreError, DocumentConverterPort, DocumentFormat, RelativePath,
};

use stub::{StubBehaviour, stub_soffice};
use vault::Fixture;

fn request() -> ConversionRequest {
    ConversionRequest::new(
        RelativePath::parse("cs454/raft/source/original.pptx").unwrap(),
        DocumentFormat::Pptx,
        RelativePath::parse("cs454/raft/source/document.pdf").unwrap(),
    )
    .unwrap()
}

/// Runs a conversion against a stub behaving the given way.
fn convert_with(behaviour: &StubBehaviour) -> (Fixture, Result<(), CoreError>) {
    let fixture = Fixture::new();
    let binary = stub_soffice(fixture.profiles.path(), behaviour);
    let converter =
        LibreOfficeConverter::at(binary, fixture.profiles.path(), fixture.storage()).unwrap();

    let outcome = converter.convert(&request());

    (fixture, outcome)
}

#[test]
fn a_successful_conversion_puts_the_pdf_where_the_manifest_says() {
    let (fixture, outcome) = convert_with(&StubBehaviour::WritesAPdf);

    outcome.expect("the conversion should succeed");

    let document = fixture.in_source("document.pdf");
    assert!(document.is_file(), "document.pdf should exist");
    assert!(
        fs::read(&document).unwrap().starts_with(b"%PDF-"),
        "and it should be the PDF the converter wrote"
    );
}

#[test]
fn the_intermediate_file_libreoffice_names_does_not_stay_behind() {
    // `soffice` writes `original.pdf`, after the input's stem. Leaving that beside the
    // real document would put a second, stale PDF in a folder someone studies in.
    let (fixture, outcome) = convert_with(&StubBehaviour::WritesAPdf);

    outcome.unwrap();

    assert!(
        !fixture.in_source("original.pdf").exists(),
        "the intermediate output should have been moved, not copied"
    );
}

#[test]
fn the_original_is_still_there_afterwards() {
    // The locked decision: the original is always kept so reconversion stays possible.
    let (fixture, outcome) = convert_with(&StubBehaviour::WritesAPdf);

    outcome.unwrap();

    assert!(fixture.in_source("original.pptx").is_file());
}

#[test]
fn a_converter_that_exits_with_an_error_produces_no_document() {
    let (fixture, outcome) = convert_with(&StubBehaviour::Fails);

    let err = outcome.expect_err("a non-zero exit should be a failure");
    assert!(matches!(err, CoreError::ConversionFailed { .. }));
    assert_eq!(err.code(), "ERR_CONVERSION_FAILED");

    assert!(!fixture.in_source("document.pdf").exists());
    assert!(
        fixture.in_source("original.pptx").is_file(),
        "a failed conversion must never cost someone their file"
    );
}

/// `LibreOffice` genuinely does this.
#[test]
fn success_with_no_output_is_a_failure_not_a_ready_conversion() {
    let (fixture, outcome) = convert_with(&StubBehaviour::SucceedsSilently);

    let err = outcome.expect_err("exit 0 is not evidence of a PDF");
    match err {
        CoreError::ConversionFailed { reason, converter } => {
            assert_eq!(reason, "it reported success but wrote no PDF");
            assert_eq!(converter, CONVERTER_LABEL);
        }
        other => panic!("wrong variant: {other:?}"),
    }

    assert!(!fixture.in_source("document.pdf").exists());
}

#[test]
fn an_empty_output_is_a_failure_and_is_cleaned_up() {
    let (fixture, outcome) = convert_with(&StubBehaviour::WritesNothing);

    let err = outcome.expect_err("a zero-length file is not a PDF");
    assert!(
        err.to_string().contains("empty"),
        "the reason should say what was wrong: {err}"
    );

    assert!(!fixture.in_source("document.pdf").exists());
    assert!(
        !fixture.in_source("original.pdf").exists(),
        "the converter's own leavings should not sit in a lecture folder"
    );
}

#[test]
fn an_output_that_is_not_a_pdf_is_refused_before_it_is_moved_into_place() {
    // Otherwise the lecture imports cleanly and breaks later in the viewer, where the
    // cause is no longer visible.
    let (fixture, outcome) = convert_with(&StubBehaviour::WritesRubbish);

    let err = outcome.expect_err("a file that is not a PDF should be refused");
    assert!(err.to_string().contains("not a PDF"), "got: {err}");

    assert!(!fixture.in_source("document.pdf").exists());
    assert!(!fixture.in_source("original.pdf").exists());
}

#[test]
fn a_failure_promises_the_original_survived_and_offers_a_retry() {
    let (_fixture, outcome) = convert_with(&StubBehaviour::Fails);

    let remediation = outcome.unwrap_err().remediation();
    assert!(remediation.contains("original file"));
    assert!(remediation.contains("Nothing was lost"));
    assert!(remediation.contains("try the conversion again"));
}

#[test]
fn reconverting_replaces_the_pdf_that_was_there() {
    // This is why the move is `replace` and not `rename`: a renumber must never write
    // over something, and a reconversion must.
    let fixture = Fixture::new();
    fs::write(
        fixture.in_source("document.pdf"),
        b"%PDF-1.4 the previous conversion",
    )
    .unwrap();

    let binary = stub_soffice(fixture.profiles.path(), &StubBehaviour::WritesAPdf);
    let converter =
        LibreOfficeConverter::at(binary, fixture.profiles.path(), fixture.storage()).unwrap();

    converter
        .convert(&request())
        .expect("reconversion should succeed");

    let written = fs::read(fixture.in_source("document.pdf")).unwrap();
    assert_eq!(
        written, b"%PDF-1.4 stub document",
        "the new conversion should have replaced the old PDF"
    );
}

#[test]
fn no_profile_directory_is_left_behind() {
    // Each conversion gets a fresh profile because `LibreOffice` locks one, and a profile
    // per import would otherwise accumulate in this app's own state directory forever.
    let (fixture, outcome) = convert_with(&StubBehaviour::WritesAPdf);
    outcome.unwrap();

    let profiles = fixture.profiles.path().join("converters");
    let leftovers: Vec<PathBuf> = fs::read_dir(&profiles)
        .map(|entries| entries.filter_map(Result::ok).map(|e| e.path()).collect())
        .unwrap_or_default();

    assert!(
        leftovers.is_empty(),
        "a conversion should clean up its profile: {leftovers:?}"
    );
}

#[test]
fn offers_itself_for_every_format_that_is_not_already_a_pdf() {
    let fixture = Fixture::new();
    let binary = stub_soffice(fixture.profiles.path(), &StubBehaviour::WritesAPdf);
    let converter =
        LibreOfficeConverter::at(binary, fixture.profiles.path(), fixture.storage()).unwrap();

    assert!(converter.supports(DocumentFormat::Pptx));
    assert!(converter.supports(DocumentFormat::Ppt));
    assert!(converter.supports(DocumentFormat::Docx));
    assert!(converter.supports(DocumentFormat::Doc));
    assert!(
        !converter.supports(DocumentFormat::Pdf),
        "a PDF needs no conversion, and claiming otherwise would make the provenance a lie"
    );
    assert_eq!(converter.label().as_str(), CONVERTER_LABEL);
}

/// The argument list is the part a real `soffice` would reject, and the part no stub can
/// vouch for. So it is asserted exactly.
#[test]
fn builds_the_argument_list_libreoffice_expects() {
    let arguments = command_arguments(
        Path::new("/profiles/libreoffice-1"),
        Path::new("/vault/cs454/raft/source"),
        Path::new("/vault/cs454/raft/source/original.pptx"),
    );

    let rendered: Vec<String> = arguments
        .iter()
        .map(|argument| argument.to_string_lossy().into_owned())
        .collect();

    assert_eq!(
        rendered,
        [
            // First, so the isolated profile is in force before anything else is read.
            "-env:UserInstallation=file:///profiles/libreoffice-1",
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            "/vault/cs454/raft/source",
            "/vault/cs454/raft/source/original.pptx",
        ]
    );
}

#[test]
fn finding_libreoffice_agrees_with_whether_it_is_installed() {
    // Written to hold on a machine with or without it, rather than asserting this
    // machine's state: the contract is that discovery and the filesystem agree.
    let fixture = Fixture::new();
    let found = LibreOfficeConverter::discover(fixture.storage()).unwrap();

    let installed = Path::new(SOFFICE_BUNDLE_PATH).is_file()
        || std::env::var_os("PATH").is_some_and(|path| {
            std::env::split_paths(&path).any(|directory| directory.join("soffice").is_file())
        });

    assert_eq!(
        found.is_some(),
        installed,
        "discovery must agree with the filesystem, in either direction"
    );
}

// There is deliberately **no** test here that converts a document with a real
// `LibreOffice`. Writing one would need two things this repository does not have: a
// machine with `LibreOffice` installed, and a genuine `.pptx` fixture to feed it. A test
// gated on both, asserting whatever the placeholder bytes happen to produce, would read
// as coverage of the one thing the stub cannot vouch for while proving nothing at all.
//
// The gap is recorded in `PROGRESS.md` instead: `LibreOffice`'s own behaviour is
// **unverified**, and `command_arguments` is asserted exactly because the argument list is
// the part a real `soffice` would reject.
