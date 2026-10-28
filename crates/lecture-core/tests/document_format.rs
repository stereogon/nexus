//! Contract tests for reading a document format off a file name.
//!
//! The list of formats is closed, and these tests are mostly about that closure holding.
//! An open "accept any extension" import would take a `.zip` and only discover at
//! conversion time that nothing can read it — after a bundle had been created and a
//! person had been told their lecture imported.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{CoreError, DocumentFormat};

#[test]
fn reads_every_format_it_claims_to_support() {
    for format in DocumentFormat::ALL {
        let parsed = DocumentFormat::from_extension(format.extension())
            .expect("a format must parse from its own extension");

        assert_eq!(parsed, format);
    }
}

#[test]
fn accepts_an_extension_with_or_without_its_dot() {
    assert_eq!(
        DocumentFormat::from_extension(".pptx").unwrap(),
        DocumentFormat::Pptx
    );
    assert_eq!(
        DocumentFormat::from_extension("pptx").unwrap(),
        DocumentFormat::Pptx
    );
}

#[test]
fn ignores_the_case_a_lecturer_happened_to_save_it_in() {
    // A file from a Windows machine is as likely to be `.PPTX` as `.pptx`, and refusing
    // it would be absurd.
    for raw in [".PPTX", "PPTX", "Pptx", ".pPtX"] {
        assert_eq!(
            DocumentFormat::from_extension(raw).unwrap(),
            DocumentFormat::Pptx,
            "{raw} should read as PowerPoint"
        );
    }
}

#[test]
fn only_a_pdf_needs_no_conversion() {
    assert!(!DocumentFormat::Pdf.needs_conversion());

    for format in DocumentFormat::ALL {
        if format != DocumentFormat::Pdf {
            assert!(
                format.needs_conversion(),
                "{format:?} is not the canonical render format, so it must be converted"
            );
        }
    }
}

#[test]
fn refuses_a_format_it_cannot_import() {
    for raw in ["zip", ".mp4", "key", "pages", "odp", "txt", "", "."] {
        let err = DocumentFormat::from_extension(raw).unwrap_err();

        assert!(
            matches!(err, CoreError::UnsupportedDocumentFormat { .. }),
            "{raw:?} should not be importable, got: {err}"
        );
        assert_eq!(err.code(), "ERR_UNSUPPORTED_DOCUMENT_FORMAT");
    }
}

#[test]
fn says_what_it_does_import_and_what_to_do_instead() {
    let err = DocumentFormat::from_extension("odp").unwrap_err();

    let remediation = err.remediation();
    assert!(remediation.contains("PDF"));
    assert!(remediation.contains("PowerPoint"));
    assert!(remediation.contains("Word"));
    assert!(
        remediation.contains("Nothing was imported"),
        "a refused import must promise nothing happened: {remediation}"
    );
    assert!(
        remediation.contains("Exporting it as a PDF"),
        "and give a way forward: {remediation}"
    );
}

#[test]
fn an_unsupported_extension_is_reported_lowercased_without_its_dot() {
    // So the message reads the same whatever the file was called, and so the value is
    // the one the parser actually compared.
    match DocumentFormat::from_extension(".ODP").unwrap_err() {
        CoreError::UnsupportedDocumentFormat { extension } => assert_eq!(extension, "odp"),
        other => panic!("wrong variant: {other:?}"),
    }
}

#[test]
fn the_two_legacy_formats_describe_themselves_as_their_modern_equivalents() {
    // A person thinks "PowerPoint", not "Office Open XML presentation".
    assert_eq!(DocumentFormat::Ppt.describe(), "PowerPoint");
    assert_eq!(DocumentFormat::Pptx.describe(), "PowerPoint");
    assert_eq!(DocumentFormat::Doc.describe(), "Word");
    assert_eq!(DocumentFormat::Docx.describe(), "Word");
    assert_eq!(DocumentFormat::Pdf.describe(), "PDF");
}

#[test]
fn every_format_round_trips_through_json() {
    // The format is not stored in `manifest.json` today, but it is the kind of thing that
    // ends up on an IPC boundary, and a silent rename there would be a format nobody can
    // read back.
    for format in DocumentFormat::ALL {
        let json = serde_json::to_string(&format).unwrap();
        let parsed: DocumentFormat = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed, format);
        assert_eq!(
            json.to_lowercase(),
            json,
            "a format name on the wire should be camelCase like the rest: {json}"
        );
    }
}
