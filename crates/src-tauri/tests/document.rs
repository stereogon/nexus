//! Locating and screening a lecture's PDF before the viewer is given it.
//!
//! The manifests here are built directly rather than by importing, so a document that is
//! not ready, or not a PDF, can be arranged exactly. Going through the importer would make
//! those cases depend on whether this machine happens to have `LibreOffice`.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use std::fs;
use std::path::{Path, PathBuf};

use lecture_core::{
    Conversion, DocumentRisk, FixedClock, Label, Manifest, OrderKey, RelativePath, Source,
    Timestamp,
};
use lecture_fs::{AtomicFsStorage, ManifestStore, VaultRoot};
use nexus_app::document::{prepare_document, warrants_a_warning};
use tempfile::TempDir;

const CREATED: &str = "2026-10-27T16:00:00Z";

/// A vault holding one lecture, whose document bytes and conversion state are the point.
struct Fixture {
    held: TempDir,
}

impl Fixture {
    fn new() -> Self {
        Self {
            held: TempDir::new().unwrap(),
        }
    }

    fn vault(&self) -> String {
        self.held.path().display().to_string()
    }

    /// Writes a lecture whose PDF holds exactly `document`.
    fn with_document(&self, directory: &str, document: &[u8]) -> &Self {
        self.write(directory, Conversion::not_required(), Some(document))
    }

    /// Writes a lecture whose PDF has not been made yet.
    fn awaiting_conversion(&self, directory: &str) -> &Self {
        self.write(directory, Conversion::queued(), None)
    }

    fn write(&self, directory: &str, conversion: Conversion, document: Option<&[u8]>) -> &Self {
        let at = RelativePath::parse(directory).unwrap();
        let root = VaultRoot::open(self.held.path()).unwrap();
        let storage = AtomicFsStorage::new(root);
        storage.create_dir(&at).unwrap();

        let original = match conversion.state() {
            lecture_core::ConversionState::NotRequired => None,
            _ => Some(RelativePath::parse("source/original.pptx").unwrap()),
        };

        let source = Source::new(
            RelativePath::parse("source/document.pdf").unwrap(),
            original,
            conversion,
        )
        .unwrap();

        let manifest = Manifest::new(
            Label::parse("Raft Consensus").unwrap(),
            OrderKey::parse("a0").unwrap(),
            source,
            Timestamp::parse(CREATED).unwrap(),
        );

        ManifestStore::new(
            AtomicFsStorage::new(VaultRoot::open(self.held.path()).unwrap()),
            FixedClock::new(Timestamp::parse(CREATED).unwrap()),
        )
        .save(&at, &manifest)
        .unwrap();

        if let Some(bytes) = document {
            let folder = self.held.path().join(directory).join("source");
            fs::create_dir_all(&folder).unwrap();
            fs::write(folder.join("document.pdf"), bytes).unwrap();
        }

        self
    }

    /// Where the document is, canonically.
    ///
    /// Canonicalised because `VaultRoot::open` canonicalises, and so the path handed to the
    /// viewer is `/private/var/...` where the `TempDir` says `/var/...`. That is the right
    /// path to hand over -- one absolute path for one file, whatever route reached it -- so
    /// the expectation follows it rather than the command being bent to match a fixture.
    fn document_at(&self, directory: &str) -> PathBuf {
        self.held
            .path()
            .canonicalize()
            .unwrap()
            .join(directory)
            .join("source")
            .join("document.pdf")
    }
}

#[test]
fn a_ready_pdf_is_prepared_with_its_path_and_size() {
    let fixture = Fixture::new();
    let bytes = b"%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n";
    fixture.with_document("raft", bytes);

    let opened = prepare_document(&fixture.vault(), "raft").unwrap();

    assert_eq!(
        Path::new(&opened.path),
        fixture.document_at("raft"),
        "the viewer is given the document inside the bundle"
    );
    assert_eq!(opened.bytes, bytes.len() as u64);
    assert!(opened.risks.is_empty(), "{:?}", opened.risks);
    assert!(!opened.needs_attention, "nothing found, nothing to say");
}

#[test]
fn the_path_handed_over_is_inside_the_vault() {
    // Containment is `VaultRoot::resolve`'s guarantee and this asserts the command actually
    // routes through it, rather than joining strings and hoping.
    let fixture = Fixture::new();
    fixture.with_document("cs-454/raft", b"%PDF-1.7\n");

    let opened = prepare_document(&fixture.vault(), "cs-454/raft").unwrap();

    assert!(
        Path::new(&opened.path).starts_with(fixture.held.path().canonicalize().unwrap()),
        "{} escaped the vault",
        opened.path
    );
}

#[test]
fn indicators_in_the_document_are_reported_worst_first() {
    let fixture = Fixture::new();
    fixture.with_document(
        "raft",
        b"%PDF-1.7\n<</OpenAction<</S/JavaScript/JS 1 0 R>>/Annots[<</A<</URI(http://x)>>>>]>>",
    );

    let opened = prepare_document(&fixture.vault(), "raft").unwrap();
    let codes: Vec<&str> = opened.risks.iter().map(|risk| risk.code).collect();

    assert_eq!(
        codes,
        ["embeddedJavascript", "actionOnOpen", "externalLink"]
    );
    assert!(opened.needs_attention);
    assert_eq!(opened.risks[0].severity, "notable");
    assert_eq!(opened.risks[2].severity, "informational");
    assert!(
        opened.risks[0].explanation.contains("Nexus"),
        "every indicator says what Nexus does about it"
    );
}

#[test]
fn a_document_with_indicators_is_still_opened() {
    // The scan reports, it does not gate. A study app that refused a lecture deck for
    // containing a hyperlink would be useless, and the viewer is already configured not to
    // act on any of these.
    let fixture = Fixture::new();
    fixture.with_document("raft", b"%PDF-1.7\n/JavaScript /Launch /EmbeddedFile");

    let opened = prepare_document(&fixture.vault(), "raft").unwrap();

    assert_eq!(opened.risks.len(), 3, "reported");
    assert!(!opened.path.is_empty(), "and still handed over");
    assert!(
        opened.needs_attention,
        "and flagged for the person to read first"
    );
}

#[test]
fn a_document_that_is_not_a_pdf_is_refused() {
    // A file named `.pdf` is not a PDF. The viewer gets a document or an error, never a
    // surprise -- and a conversion that wrote something else is a converter fault worth
    // reporting rather than passing on.
    let fixture = Fixture::new();
    fixture.with_document("raft", b"<html><body>not a pdf at all</body></html>");

    let refused = prepare_document(&fixture.vault(), "raft").unwrap_err();

    assert_eq!(refused.code, "ERR_NOT_A_PDF");
    assert!(refused.remediation.contains("Re-import"));
}

#[test]
fn an_empty_document_is_refused_rather_than_opened_blank() {
    let fixture = Fixture::new();
    fixture.with_document("raft", b"");

    assert_eq!(
        prepare_document(&fixture.vault(), "raft").unwrap_err().code,
        "ERR_NOT_A_PDF"
    );
}

#[test]
fn a_truncated_signature_is_refused() {
    // `%PDF` without the hyphen. Checked because the signature is read across buffer
    // boundaries, so "shorter than the signature" is a real shape to get wrong.
    let fixture = Fixture::new();
    fixture.with_document("raft", b"%PDF");

    assert_eq!(
        prepare_document(&fixture.vault(), "raft").unwrap_err().code,
        "ERR_NOT_A_PDF"
    );
}

#[test]
fn a_lecture_whose_pdf_does_not_exist_yet_is_told_so() {
    // Not "not a PDF": nothing has been converted, which is a different thing to do about.
    let fixture = Fixture::new();
    fixture.awaiting_conversion("raft");

    let refused = prepare_document(&fixture.vault(), "raft").unwrap_err();

    assert_eq!(refused.code, "ERR_DOCUMENT_NOT_READY");
    assert!(
        refused.remediation.contains("still kept"),
        "it must say the imported file is safe: {}",
        refused.remediation
    );
}

#[test]
fn a_directory_that_climbs_out_of_the_vault_is_refused() {
    // The webview names the lecture, so this is reachable from the untrusted side.
    // `RelativePath::parse` is what refuses it; this asserts the command routes through it.
    let fixture = Fixture::new();
    fixture.with_document("raft", b"%PDF-1.7\n");

    for escape in ["../outside", "raft/../../outside", "/etc", "raft/./../.."] {
        assert!(
            prepare_document(&fixture.vault(), escape).is_err(),
            "{escape} was accepted"
        );
    }
}

#[test]
fn a_warning_is_warranted_only_by_a_notable_indicator() {
    assert!(warrants_a_warning(&[DocumentRisk::EmbeddedJavascript]));
    assert!(!warrants_a_warning(&[DocumentRisk::ExternalLink]));
    assert!(!warrants_a_warning(&[]));
    assert!(
        warrants_a_warning(&[DocumentRisk::ExternalLink, DocumentRisk::LaunchesAProgram]),
        "one notable among informational ones still warrants it"
    );
}
