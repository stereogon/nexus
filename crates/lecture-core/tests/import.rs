//! What an import decides, tested without a filesystem or a converter.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{
    Conversion, ConversionState, DocumentFormat, Fingerprint, ImportPlan, MAX_BUNDLE_DEPTH,
    MAX_DEPTH, RelativePath, Slug, Source,
};

fn bundle() -> RelativePath {
    RelativePath::parse("cs454/raft").unwrap()
}

fn plan(format: DocumentFormat) -> ImportPlan {
    ImportPlan::new(&bundle(), format).unwrap()
}

#[test]
fn a_pdf_is_stored_once_and_has_no_separate_original() {
    // Keeping a byte-for-byte copy under a second name would double the disk cost of every
    // PDF lecture, and there is nothing to reconvert from.
    let plan = plan(DocumentFormat::Pdf);

    assert_eq!(
        plan.document().to_string(),
        "cs454/raft/source/document.pdf"
    );
    assert_eq!(plan.original(), None);
    assert!(!plan.needs_conversion());
    assert_eq!(plan.destination(), plan.document());
}

#[test]
fn anything_else_keeps_its_original_beside_the_pdf_it_will_become() {
    let plan = plan(DocumentFormat::Pptx);

    assert_eq!(
        plan.document().to_string(),
        "cs454/raft/source/document.pdf"
    );
    assert_eq!(
        plan.original().map(ToString::to_string),
        Some("cs454/raft/source/original.pptx".to_owned())
    );
    assert!(plan.needs_conversion());

    // The bytes being imported are the original; the document does not exist yet.
    assert_eq!(plan.destination(), plan.original().unwrap());
}

#[test]
fn the_stored_name_is_canonical_rather_than_whatever_the_file_was_called() {
    // A bundle is self-describing whatever a person called the download, and the name they
    // know the lecture by lives in the manifest's title where it may contain spaces.
    for (format, expected) in [
        (DocumentFormat::Pptx, "original.pptx"),
        (DocumentFormat::Ppt, "original.ppt"),
        (DocumentFormat::Docx, "original.docx"),
        (DocumentFormat::Doc, "original.doc"),
    ] {
        let name = plan(format).original().unwrap().name().as_str().to_owned();

        assert_eq!(name, expected);
    }
}

#[test]
fn a_pdf_import_owes_no_conversion() {
    assert_eq!(
        plan(DocumentFormat::Pdf).conversion_request().unwrap(),
        None
    );
}

#[test]
fn a_conversion_request_names_the_two_paths_and_the_format() {
    let plan = plan(DocumentFormat::Docx);
    let request = plan.conversion_request().unwrap().unwrap();

    assert_eq!(request.original(), plan.original().unwrap());
    assert_eq!(request.document(), plan.document());
    assert_eq!(request.format(), DocumentFormat::Docx);
}

#[test]
fn a_pdf_records_its_fingerprint_against_the_document() {
    let imported = Fingerprint::of(b"%PDF-1.7 a real lecture");
    let source = plan(DocumentFormat::Pdf).source(imported).unwrap();

    assert_eq!(source.document_fingerprint(), Some(&imported));
    assert_eq!(source.original_fingerprint(), None);
    assert_eq!(source.conversion().state(), ConversionState::NotRequired);
    assert!(source.document_is_ready());
}

#[test]
fn a_convertible_records_its_fingerprint_against_the_original() {
    // The document has not been made yet, so a fingerprint for it would be a fingerprint
    // of nothing -- which is the one shape `with_fingerprints` refuses outright.
    let imported = Fingerprint::of(b"PK\x03\x04 a slide deck");
    let source = plan(DocumentFormat::Pptx).source(imported).unwrap();

    assert_eq!(source.document_fingerprint(), None);
    assert_eq!(source.original_fingerprint(), Some(&imported));
    assert_eq!(source.conversion().state(), ConversionState::Queued);
    assert!(
        !source.document_is_ready(),
        "nothing should open a document that has not been converted yet"
    );
}

#[test]
fn an_imported_source_survives_a_round_trip_through_the_manifest() {
    // The plan's output is written to disk, so it has to come back the same.
    let source = plan(DocumentFormat::Pptx)
        .source(Fingerprint::of(b"a slide deck"))
        .unwrap();

    let json = serde_json::to_string(&source).unwrap();
    let read: Source = serde_json::from_str(&json).unwrap();

    assert_eq!(read, source);
}

#[test]
fn the_plan_describes_the_same_thing_the_domain_would_accept_by_hand() {
    // Guards against the plan drifting from `Source`'s own invariants: if `queued` ever
    // stopped meaning what this assembles, one of the two would have to change.
    let plan = plan(DocumentFormat::Docx);
    let by_hand = Source::new(
        plan.document().clone(),
        plan.original().cloned(),
        Conversion::queued(),
    )
    .unwrap();

    assert_eq!(
        plan.source(Fingerprint::of(b"x")).unwrap().conversion(),
        by_hand.conversion()
    );
}

#[test]
fn a_bundle_at_the_deepest_allowed_level_can_still_address_its_own_document() {
    // The headroom in `MAX_DEPTH` exists for exactly this. Conflating the two caps was a
    // real bug: a bundle at the five levels the spec allows could not name a file inside
    // itself, so a legitimate vault layout produced a lecture the app could not open.
    //
    // Derived from the constants rather than written as `a/b/c/d/e`, so shrinking the
    // headroom fails here instead of in someone's vault.
    let segments = (0..MAX_BUNDLE_DEPTH)
        .map(|level| Slug::internal(&format!("level{level}")).unwrap())
        .collect();
    let deepest = RelativePath::from_segments(segments).unwrap();
    assert_eq!(deepest.depth(), MAX_BUNDLE_DEPTH);

    let plan = ImportPlan::new(&deepest, DocumentFormat::Pptx).unwrap();

    assert_eq!(plan.document().depth(), MAX_BUNDLE_DEPTH + 2);
    assert!(plan.document().depth() <= MAX_DEPTH);
    assert!(
        plan.original().is_some(),
        "and the original beside it must fit too"
    );
}
