//! How an import drives a conversion, and what is on disk at each step.
//!
//! What lands where is in `import.rs`; these are about the state machine and the order the
//! manifest is written in.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

#[path = "support/import_converter.rs"]
mod import_converter;
#[path = "support/import_vault.rs"]
mod import_vault;

use lecture_core::{
    Conversion, ConversionState, Fingerprint, FixedClock, Label, Manifest, OrderKey, RelativePath,
    Source, fingerprint_hex,
};
use lecture_fs::ManifestStore;

use import_converter::{Behaviour, stub};
use import_vault::{Fixture, instant, request};

#[test]
fn a_deck_with_no_converter_waits_rather_than_failing() {
    // Not an error: `Queued` is the truth, and is exactly what lets installing LibreOffice
    // later finish the job.
    let fixture = Fixture::new();
    let file = fixture.waiting("week3.pptx", b"PK\x03\x04 a slide deck");

    let outcome = fixture.importer().import(&request(&file), None).unwrap();
    let source = outcome.manifest.source().unwrap();

    assert_eq!(source.conversion().state(), ConversionState::Queued);
    assert!(!source.document_is_ready());
    assert!(outcome.conversion_error.is_none());
    assert!(
        fixture.in_bundle("original.pptx").is_file(),
        "the imported file is kept whatever happens next"
    );
    assert!(!fixture.in_bundle("document.pdf").exists());
    assert_eq!(
        source.document_fingerprint(),
        None,
        "there is no document yet to have a fingerprint of"
    );
}

#[test]
fn a_converter_that_handles_other_formats_leaves_it_queued_not_failed() {
    // The distinction matters: `Failed` says someone tried and could not, which would send
    // a person looking for a problem with their file.
    let fixture = Fixture::new();
    let file = fixture.waiting("week3.pptx", b"PK\x03\x04 a slide deck");
    let stub = stub(&fixture.vault, Behaviour::HandlesNothing);

    let outcome = fixture
        .importer()
        .import(&request(&file), Some(&stub))
        .unwrap();

    assert_eq!(
        outcome.manifest.source().unwrap().conversion().state(),
        ConversionState::Queued
    );
    assert!(outcome.conversion_error.is_none());
}

#[test]
fn a_converted_deck_records_the_converter_the_time_and_both_fingerprints() {
    let fixture = Fixture::new();
    let deck = b"PK\x03\x04 a slide deck";
    let file = fixture.waiting("week3.pptx", deck);
    let stub = stub(&fixture.vault, Behaviour::Converts);

    let outcome = fixture
        .importer()
        .import(&request(&file), Some(&stub))
        .unwrap();
    let source = outcome.manifest.source().unwrap();

    assert_eq!(source.conversion().state(), ConversionState::Ready);
    assert!(source.document_is_ready());
    assert_eq!(
        source.conversion().converter().map(Label::as_str),
        Some("libreoffice")
    );
    assert_eq!(source.conversion().converted_at(), Some(&instant()));

    // Both files exist, and each fingerprint is of the right one.
    assert_eq!(
        source.original_fingerprint().map(Fingerprint::as_hex),
        Some(fingerprint_hex(deck))
    );
    assert_eq!(
        source.document_fingerprint().map(Fingerprint::as_hex),
        Some(fingerprint_hex(b"%PDF-1.7 converted by the stub")),
        "the document's fingerprint is of the PDF, not of the deck"
    );
    assert!(fixture.in_bundle("original.pptx").is_file());
}

#[test]
fn a_failed_conversion_keeps_the_file_and_says_why() {
    // CLAUDE.md §1.4: a conversion that fails keeps the original. The import succeeded.
    let fixture = Fixture::new();
    let file = fixture.waiting("week3.pptx", b"PK\x03\x04 a slide deck");
    let stub = stub(&fixture.vault, Behaviour::Fails);

    let outcome = fixture
        .importer()
        .import(&request(&file), Some(&stub))
        .unwrap();

    assert_eq!(
        outcome.manifest.source().unwrap().conversion().state(),
        ConversionState::Failed
    );
    assert!(
        fixture.in_bundle("original.pptx").is_file(),
        "a failed conversion must never cost someone their file"
    );

    let error = outcome
        .conversion_error
        .expect("the reason must be carried, not swallowed");
    assert_eq!(error.code(), "ERR_CONVERSION_FAILED");
    assert!(!error.remediation().is_empty());
}

#[test]
fn the_manifest_is_on_disk_and_reads_back_the_same() {
    // The outcome is returned in memory; what matters is what a later launch will find.
    let fixture = Fixture::new();
    let file = fixture.waiting("week3.pptx", b"PK\x03\x04 a slide deck");
    let stub = stub(&fixture.vault, Behaviour::Converts);

    let outcome = fixture
        .importer()
        .import(&request(&file), Some(&stub))
        .unwrap();

    let store = ManifestStore::new(fixture.storage(), FixedClock::new(instant()));
    let read = store
        .load(&RelativePath::parse("cs454/raft").unwrap())
        .unwrap();

    assert_eq!(read.source().unwrap(), outcome.manifest.source().unwrap());
    assert_eq!(read.title().as_str(), "Raft and consensus");
}

#[test]
fn the_manifest_already_says_converting_while_the_converter_is_running() {
    // The claim the whole order of operations rests on, checked from inside the conversion
    // rather than asserted in a comment.
    //
    // `Conversion` only allows `succeeded` and `did_not_finish` out of `Converting`, so
    // `Converting` found on disk at startup can mean exactly one thing: a process began and
    // never came back. That only holds if the state is written *before* the process starts,
    // which is what this observes.
    let fixture = Fixture::new();
    let file = fixture.waiting("week3.pptx", b"PK\x03\x04 a slide deck");
    let stub = stub(&fixture.vault, Behaviour::ConvertsAndWatchesTheManifest);

    let outcome = fixture
        .importer()
        .import(&request(&file), Some(&stub))
        .unwrap();

    assert_eq!(
        stub.seen.into_inner(),
        Some(ConversionState::Converting),
        "an interrupted conversion is only detectable if this is already on disk"
    );
    assert_eq!(
        outcome.manifest.source().unwrap().conversion().state(),
        ConversionState::Ready,
        "and it must not stay that way once the conversion finishes"
    );
}

#[test]
fn a_manifest_left_mid_conversion_is_recognised_as_interrupted() {
    // The payoff of writing `Converting` before the process starts. This writes the state a
    // killed import would leave behind -- which the domain's transitions make reachable no
    // other way -- and checks a later launch can tell.
    //
    // An earlier version of this test imported successfully and then asserted the result
    // was *not* interrupted. That is true of anything that finished and tested nothing.
    let fixture = Fixture::new();
    let bundle = RelativePath::parse("cs454/raft").unwrap();
    let store = ManifestStore::new(fixture.storage(), FixedClock::new(instant()));

    let interrupted = Conversion::queued()
        .started(Label::parse("libreoffice").unwrap())
        .unwrap();
    let source = Source::new(
        RelativePath::parse("cs454/raft/source/document.pdf").unwrap(),
        Some(RelativePath::parse("cs454/raft/source/original.pptx").unwrap()),
        interrupted,
    )
    .unwrap();

    fixture
        .storage()
        .create_dir(&RelativePath::parse("cs454/raft").unwrap())
        .unwrap();
    store
        .save(
            &bundle,
            &Manifest::new(
                Label::parse("Raft and consensus").unwrap(),
                OrderKey::first(),
                source,
                instant(),
            ),
        )
        .unwrap();

    let found = store.load(&bundle).unwrap();

    assert_eq!(
        found.source().unwrap().conversion().state(),
        ConversionState::Converting,
        "the state must survive a round trip, or it cannot be detected at all"
    );
    assert!(
        found.source().unwrap().conversion().was_interrupted(),
        "a conversion recorded as running, with no process running, is interrupted"
    );
    assert!(!found.source().unwrap().document_is_ready());
}
