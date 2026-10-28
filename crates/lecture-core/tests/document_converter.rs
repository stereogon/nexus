//! Contract tests for the converter port, driven by a mock.
//!
//! `claude-spec.md` asks for this by name: "use a mock `DocumentConverterPort` to test
//! conversion state transitions (`Queued -> Converting -> Ready` and `Failed` error
//! propagation)". The mock is the point — it is what proves the domain can express the
//! whole lifecycle without any converter existing, which is the property that lets this
//! crate compile for iPadOS.
//!
//! The case worth most attention is
//! [`an_import_with_no_converter_available_stays_queued_rather_than_failing`]: no
//! converter installed must not look like a failure, because it is not one.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::cell::RefCell;

use lecture_core::{
    Conversion, ConversionRequest, ConversionState, CoreError, DocumentConverterPort,
    DocumentFormat, Label, RelativePath, Source, Timestamp, select_converter,
};

fn label(raw: &str) -> Label {
    Label::parse(raw).unwrap()
}

fn path(raw: &str) -> RelativePath {
    RelativePath::parse(raw).unwrap()
}

fn at(raw: &str) -> Timestamp {
    Timestamp::parse(raw).unwrap()
}

const WHEN: &str = "2026-10-28T10:00:00Z";

/// A converter that records what it was asked and answers however the test needs.
struct MockConverter {
    name: Label,
    handles: Vec<DocumentFormat>,
    outcome: Result<(), &'static str>,
    seen: RefCell<Vec<ConversionRequest>>,
}

impl MockConverter {
    fn working(name: &str, handles: &[DocumentFormat]) -> Self {
        Self {
            name: label(name),
            handles: handles.to_vec(),
            outcome: Ok(()),
            seen: RefCell::new(Vec::new()),
        }
    }

    fn broken(name: &str, handles: &[DocumentFormat], reason: &'static str) -> Self {
        Self {
            name: label(name),
            handles: handles.to_vec(),
            outcome: Err(reason),
            seen: RefCell::new(Vec::new()),
        }
    }

    fn calls(&self) -> usize {
        self.seen.borrow().len()
    }
}

impl DocumentConverterPort for MockConverter {
    fn label(&self) -> &Label {
        &self.name
    }

    fn supports(&self, format: DocumentFormat) -> bool {
        self.handles.contains(&format)
    }

    fn convert(&self, request: &ConversionRequest) -> Result<(), CoreError> {
        self.seen.borrow_mut().push(request.clone());

        self.outcome
            .map_err(|reason| CoreError::InvalidManifest { reason })
    }
}

fn request() -> ConversionRequest {
    ConversionRequest::new(
        path("cs454/raft/source/original.pptx"),
        DocumentFormat::Pptx,
        path("cs454/raft/source/document.pdf"),
    )
    .unwrap()
}

/// The whole happy path, as the importer will run it.
#[test]
fn queued_then_converting_then_ready() {
    let converter = MockConverter::working("libreoffice", &[DocumentFormat::Pptx]);

    let conversion = Conversion::queued();
    assert_eq!(conversion.state(), ConversionState::Queued);

    let conversion = conversion.started(converter.label().clone()).unwrap();
    assert_eq!(conversion.state(), ConversionState::Converting);

    converter.convert(&request()).unwrap();

    let conversion = conversion.succeeded(at(WHEN)).unwrap();
    assert_eq!(conversion.state(), ConversionState::Ready);
    assert_eq!(
        conversion.converter().map(Label::as_str),
        Some("libreoffice"),
        "the provenance must name the tool, so a synced bundle is self-describing"
    );
    assert_eq!(converter.calls(), 1);
}

#[test]
fn a_converter_error_becomes_a_failed_conversion_that_keeps_the_original() {
    let converter = MockConverter::broken(
        "libreoffice",
        &[DocumentFormat::Pptx],
        "the converter exited without writing a PDF",
    );

    let conversion = Conversion::queued()
        .started(converter.label().clone())
        .unwrap();

    let error = converter.convert(&request()).unwrap_err();
    assert!(!error.remediation().is_empty());

    let failed = conversion.did_not_finish().unwrap();

    assert_eq!(failed.state(), ConversionState::Failed);
    assert_eq!(failed.converter().map(Label::as_str), Some("libreoffice"));

    // And the record still insists on keeping the original, which is the promise that
    // makes a failure retryable rather than terminal.
    let source = Source::new(
        path("source/document.pdf"),
        Some(path("source/original.pptx")),
        failed,
    )
    .unwrap();
    assert!(source.original().is_some());
    assert!(!source.document_is_ready());
}

#[test]
fn a_failed_conversion_can_be_retried_with_a_different_converter() {
    // The usual reason a conversion failed is that the right tool was not installed.
    let failed = Conversion::queued()
        .started(label("libreoffice"))
        .unwrap()
        .did_not_finish()
        .unwrap();

    let keynote = MockConverter::working("keynote", &[DocumentFormat::Pptx]);
    let retrying = failed.started(keynote.label().clone()).unwrap();

    assert_eq!(retrying.state(), ConversionState::Converting);
    assert_eq!(retrying.converter().map(Label::as_str), Some("keynote"));
}

#[test]
fn an_import_with_no_converter_available_stays_queued_rather_than_failing() {
    // No converter installed is a fact about this machine, not about the lecture.
    // `manifest.json` syncs, so recording it there would carry a Mac's missing
    // LibreOffice to an iPad and back again. Queued is both true and useful: it is
    // exactly what should happen when a converter arrives later.
    let none: [&dyn DocumentConverterPort; 0] = [];

    assert!(select_converter(&none, DocumentFormat::Pptx).is_none());

    let source = Source::new(
        path("source/document.pdf"),
        Some(path("source/original.pptx")),
        Conversion::queued(),
    )
    .unwrap();

    assert_eq!(source.conversion().state(), ConversionState::Queued);
    assert!(
        !source.document_is_ready(),
        "nothing may try to open a PDF that has not been produced"
    );
    assert!(
        source.original().is_some(),
        "the import kept the file, which is the whole point of not failing"
    );
}

#[test]
fn picks_the_first_converter_in_preference_order_that_can_do_the_job() {
    // Order is the caller's to decide. Which tool produces better output is knowledge
    // about tools, and that lives in the adapter layer, not here.
    let keynote = MockConverter::working("keynote", &[DocumentFormat::Pptx]);
    let soffice =
        MockConverter::working("libreoffice", &[DocumentFormat::Pptx, DocumentFormat::Docx]);

    let preferred: [&dyn DocumentConverterPort; 2] = [&soffice, &keynote];
    let chosen = select_converter(&preferred, DocumentFormat::Pptx).expect("one handles pptx");
    assert_eq!(chosen.label().as_str(), "libreoffice");

    let reversed: [&dyn DocumentConverterPort; 2] = [&keynote, &soffice];
    let chosen = select_converter(&reversed, DocumentFormat::Pptx).expect("one handles pptx");
    assert_eq!(chosen.label().as_str(), "keynote");
}

#[test]
fn skips_a_converter_that_cannot_handle_the_format() {
    let keynote = MockConverter::working("keynote", &[DocumentFormat::Pptx]);
    let soffice = MockConverter::working("libreoffice", &[DocumentFormat::Docx]);
    let available: [&dyn DocumentConverterPort; 2] = [&keynote, &soffice];

    let chosen = select_converter(&available, DocumentFormat::Docx).expect("one handles docx");
    assert_eq!(chosen.label().as_str(), "libreoffice");

    assert!(
        select_converter(&available, DocumentFormat::Doc).is_none(),
        "neither handles legacy Word, and saying so is better than trying"
    );
}

#[test]
fn refuses_a_request_to_convert_a_pdf_into_a_pdf() {
    // A caller's mistake. Copying the file and recording a conversion that never ran
    // would make the provenance a lie.
    let err = ConversionRequest::new(
        path("source/original.pdf"),
        DocumentFormat::Pdf,
        path("source/document.pdf"),
    )
    .unwrap_err();

    assert!(matches!(err, CoreError::UnsupportedDocumentFormat { .. }));
}

#[test]
fn a_request_carries_the_paths_the_adapter_needs_and_nothing_absolute() {
    let request = request();

    assert_eq!(
        request.original().to_string(),
        "cs454/raft/source/original.pptx"
    );
    assert_eq!(
        request.document().to_string(),
        "cs454/raft/source/document.pdf"
    );
    assert_eq!(request.format(), DocumentFormat::Pptx);
}
