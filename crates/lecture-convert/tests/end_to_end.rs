//! The one thing a stub cannot establish: that `LibreOffice` itself behaves as assumed.
//!
//! # Why these are `#[ignore]`d
//!
//! They need `LibreOffice` installed, which makes them genuinely environment-dependent —
//! the single reason `CLAUDE.md` §4 allows an `#[ignore]`. `scripts/gate.sh` runs them
//! automatically when `soffice` is present and reports them as **skipped** when it is not,
//! so an environment without it produces a visible gap rather than a quiet pass. The CI
//! runner has no `LibreOffice`, so CI skips them and says so.
//!
//! They are deliberately **not** written to pass when the converter is absent. A test that
//! succeeds without running is the weakened test the anti-patchwork clause forbids.
//!
//! # These run one at a time, by the gate's choice
//!
//! `LibreOffice`'s macOS build registers as a GUI application however it is invoked —
//! `--headless`, `--invisible`, `--nodefault` and `--nologo` were each measured and none
//! suppresses it — so every conversion puts an icon in the Dock for about a second. Run in
//! parallel, these tests put four there at once.
//!
//! `scripts/gate.sh` therefore passes `--test-threads=1`. Nothing here *depends* on running
//! serially; it is a courtesy to whoever is at the keyboard. Running `cargo test ...
//! --ignored` by hand will still flash several icons.
//!
//! # The fixture is built, not downloaded
//!
//! `tests/fixtures/minimal.docx` is a real Office Open XML package — three parts in a
//! zip — generated so the repository needs no network to reproduce it and so the fixture
//! is reviewable as text. `.docx` rather than `.pptx` because a minimal valid presentation
//! needs a slide master, a layout and their relationships, which is a great deal of XML to
//! carry for a conversion test.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

#[path = "support/vault.rs"]
mod vault;

use std::fs;
use std::path::{Path, PathBuf};

use lecture_convert::{LibreOfficeConverter, SOFFICE_BUNDLE_PATH};
use lecture_core::{
    ConversionRequest, DocumentConverterPort, DocumentFormat, Label, RelativePath, Timestamp,
};

use lecture_core::Conversion;
use vault::Fixture;

/// The real binary, or a skip-worthy failure explaining itself.
fn soffice() -> PathBuf {
    let path = PathBuf::from(SOFFICE_BUNDLE_PATH);
    assert!(
        path.is_file(),
        "LibreOffice is required for this test and is not at {SOFFICE_BUNDLE_PATH}. \
         Install it with `brew install --cask libreoffice`, or run the suite without \
         `--ignored`."
    );

    path
}

/// A vault whose lecture holds one of the real fixtures as its original.
fn fixture_holding(name: &str, extension: &str) -> Fixture {
    let fixture = Fixture::new();
    let document = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(name);

    fs::copy(
        &document,
        fixture.in_source(&format!("original.{extension}")),
    )
    .expect("the fixture should copy in");

    if extension != "pptx" {
        fs::remove_file(fixture.in_source("original.pptx")).expect("the placeholder should go");
    }

    fixture
}

fn request_for(extension: &str, format: DocumentFormat) -> ConversionRequest {
    ConversionRequest::new(
        RelativePath::parse(&format!("cs454/raft/source/original.{extension}")).unwrap(),
        format,
        RelativePath::parse("cs454/raft/source/document.pdf").unwrap(),
    )
    .unwrap()
}

#[test]
#[ignore = "requires LibreOffice; run with --ignored, or let scripts/gate.sh run it"]
fn a_real_libreoffice_converts_a_real_document() {
    let fixture = fixture_holding("minimal.docx", "docx");

    // `at` rather than `discover`, so the profile is made under a temporary directory and
    // this test never touches the real LibreOffice profile on this machine.
    let converter =
        LibreOfficeConverter::at(soffice(), fixture.profiles.path(), fixture.storage()).unwrap();

    converter
        .convert(&request_for("docx", DocumentFormat::Docx))
        .expect("LibreOffice should convert a valid .docx");

    let document = fixture.in_source("document.pdf");
    let bytes = fs::read(&document).expect("the PDF should be readable");

    assert!(
        bytes.starts_with(b"%PDF-"),
        "the output should be a real PDF"
    );
    assert!(
        bytes.len() > 1_000,
        "a PDF of two paragraphs should be more than a header: {} bytes",
        bytes.len()
    );

    assert!(
        !fixture.in_source("minimal.pdf").exists() && !fixture.in_source("original.pdf").exists(),
        "the intermediate LibreOffice named after the input should have been moved"
    );
    assert!(
        fixture.in_source("original.docx").is_file(),
        "the original must survive, so reconversion stays possible"
    );
}

#[test]
#[ignore = "requires LibreOffice; run with --ignored, or let scripts/gate.sh run it"]
fn a_real_conversion_drives_the_state_machine_to_ready() {
    // The adapter and the domain, together, which is the pairing the spec asks for: a
    // conversion that really happened produces provenance a synced bundle can describe
    // itself with.
    let fixture = fixture_holding("minimal.docx", "docx");
    let converter =
        LibreOfficeConverter::at(soffice(), fixture.profiles.path(), fixture.storage()).unwrap();

    let conversion = Conversion::queued()
        .started(converter.label().clone())
        .unwrap();

    converter
        .convert(&request_for("docx", DocumentFormat::Docx))
        .expect("the conversion works");

    let ready = conversion
        .succeeded(Timestamp::parse("2026-10-28T10:30:00Z").unwrap())
        .unwrap();

    assert_eq!(ready.converter().map(Label::as_str), Some("libreoffice"));
    assert!(ready.converted_at().is_some());
}

#[test]
#[ignore = "requires LibreOffice; run with --ignored, or let scripts/gate.sh run it"]
fn a_real_libreoffice_is_lenient_about_what_it_will_convert() {
    // This test was first written asserting the opposite, and the real converter proved
    // it wrong. Given a file named `.docx` whose contents are not a document at all,
    // LibreOffice 26.8 does *not* fail: it sniffs the bytes, falls back to its plain-text
    // filter, and produces a genuine PDF containing that text.
    //
    // Recorded as behaviour rather than corrected, because the outcome is tolerable and
    // the alternative is a feature. The original is kept, the PDF is real, and a person
    // opening a lecture full of mojibake can see immediately that the import went wrong
    // and re-import. Refusing it would need format sniffing of our own, before import —
    // a worthwhile thing, and the importer's job, not the converter's. Noted in
    // PROGRESS.md as an option not taken.
    let fixture = Fixture::new();
    fs::write(
        fixture.in_source("original.docx"),
        b"not an office document",
    )
    .unwrap();

    let converter =
        LibreOfficeConverter::at(soffice(), fixture.profiles.path(), fixture.storage()).unwrap();

    converter
        .convert(&request_for("docx", DocumentFormat::Docx))
        .expect("LibreOffice falls back to a text filter rather than failing");

    // What must hold either way: a real PDF where the manifest says, and the original
    // still there.
    let bytes = fs::read(fixture.in_source("document.pdf")).expect("a PDF was produced");
    assert!(bytes.starts_with(b"%PDF-"));
    assert!(
        fixture.in_source("original.docx").is_file(),
        "whatever the converter made of it, the imported file must survive"
    );
    assert!(
        !fixture.in_source("original.pdf").exists(),
        "and the intermediate must not be left behind"
    );
}

#[test]
#[ignore = "requires LibreOffice; run with --ignored, or let scripts/gate.sh run it"]
fn a_real_libreoffice_converts_a_real_powerpoint_package() {
    // A different import filter from the `.docx` case -- Impress rather than Writer -- and
    // the format the app is most likely to be handed. See `tests/fixtures/README.md` for
    // what this fixture does and does not establish: it is a real 14-part OOXML package,
    // but `LibreOffice` wrote it, so this shows it reads its own output rather than that it
    // reads what `PowerPoint` writes.
    let fixture = fixture_holding("minimal.pptx", "pptx");
    let converter =
        LibreOfficeConverter::at(soffice(), fixture.profiles.path(), fixture.storage()).unwrap();

    converter
        .convert(&request_for("pptx", DocumentFormat::Pptx))
        .expect("LibreOffice should convert a valid .pptx");

    let bytes = fs::read(fixture.in_source("document.pdf")).expect("the PDF should be readable");

    assert!(bytes.starts_with(b"%PDF-"));
    assert!(
        bytes.len() > 1_000,
        "a slide with a line of text should be more than a header: {} bytes",
        bytes.len()
    );
    assert!(
        fixture.in_source("original.pptx").is_file(),
        "the deck must survive so reconversion stays possible"
    );
}

#[test]
#[ignore = "requires LibreOffice; run with --ignored, or let scripts/gate.sh run it"]
fn discovery_finds_the_installed_libreoffice() {
    let fixture = Fixture::new();

    let found = LibreOfficeConverter::discover(fixture.storage())
        .expect("discovery should not fail")
        .expect("LibreOffice is installed, so it should be found");

    assert!(found.supports(DocumentFormat::Docx));
}
