//! The on-disk shape of the vault's JSON files, pinned as committed fixtures.
//!
//! # What this file is for
//!
//! `manifest.json` and `annotations.json` are described twice: once by the Rust types
//! that write them, and once by the Zod schemas that the UI validates them with before
//! trusting an IPC payload (`CLAUDE.md` §4). Two descriptions of one shape are free to
//! drift, and the drift would show up as a corrupted-looking file in front of someone
//! trying to study.
//!
//! So the shape is written down once, as a fixture under `fixtures/`, and both sides are
//! held to it:
//!
//! - These tests assert the Rust types still serialise to exactly those bytes. Change a
//!   field and this fails until the fixture is regenerated on purpose.
//! - `src/schemas/*.test.ts` asserts the Zod schemas accept exactly those bytes. Let the
//!   schema fall behind and that fails instead.
//!
//! Neither side can move without the other noticing, and no code generator or extra
//! dependency is involved.
//!
//! # Regenerating
//!
//! ```text
//! UPDATE_FIXTURES=1 cargo test -p lecture-core --test wire_format
//! ```
//!
//! Then read the diff before committing it. The environment-variable-to-regenerate
//! pattern is the one `insta` and `trybuild` use; it is named here so the next reader
//! recognises it rather than wondering whether the test is self-certifying.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::path::PathBuf;

use lecture_core::{
    Annotation, AnnotationId, AnnotationSet, Conversion, Excerpt, Facets, Fingerprint,
    HighlightSemantic, Label, Manifest, NormalizedRect, OrderKey, PageNumber, RelativePath, Source,
    Timestamp,
};

const CREATED: &str = "2026-10-27T16:00:00Z";
const UPDATED: &str = "2026-10-28T09:30:00Z";

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(name)
}

/// Serialises exactly as `lecture-fs::versioned::save` does, so a fixture is
/// byte-identical to a file the app would actually write.
fn to_file_bytes<T: serde::Serialize>(value: &T) -> Vec<u8> {
    let mut bytes = serde_json::to_vec_pretty(value).unwrap();
    bytes.push(b'\n');
    bytes
}

/// Compares against the committed fixture, or rewrites it when asked.
fn assert_matches_fixture(name: &str, actual: &[u8]) {
    let path = fixture_path(name);

    if std::env::var_os("UPDATE_FIXTURES").is_some() {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, actual).unwrap();
        return;
    }

    let expected = fs::read(&path).unwrap_or_else(|e| {
        panic!(
            "cannot read fixture {}: {e}\n\
             regenerate with: UPDATE_FIXTURES=1 cargo test -p lecture-core --test wire_format",
            path.display()
        )
    });

    assert_eq!(
        String::from_utf8_lossy(actual),
        String::from_utf8_lossy(&expected),
        "\n{name} no longer matches the committed fixture.\n\
         If the shape changed on purpose, this is a schemaVersion question first and a \
         fixture question second.\n\
         Regenerate with: UPDATE_FIXTURES=1 cargo test -p lecture-core --test wire_format\n"
    );
}

fn label(raw: &str) -> Label {
    Label::parse(raw).unwrap()
}

fn at(raw: &str) -> Timestamp {
    Timestamp::parse(raw).unwrap()
}

/// A manifest exercising every field, including the optional facets.
fn canonical_manifest() -> Manifest {
    let source = Source::new(
        RelativePath::parse("source/document.pdf").unwrap(),
        Some(RelativePath::parse("source/original.pptx").unwrap()),
        Conversion::ready(label("libreoffice"), at(CREATED)),
    )
    .unwrap()
    // Both fingerprints are set so the fixture exercises the fields rather than only
    // declaring them. A fixture that leaves an optional field out proves nothing about
    // whether the other language can read it.
    .with_fingerprints(
        Some(Fingerprint::of(b"the rendered pdf")),
        Some(Fingerprint::of(b"the imported pptx")),
    )
    .unwrap();

    let facets = Facets::default()
        .with_course(label("CS454 Distributed Systems"))
        .with_module(label("Consensus"))
        .with_week(label("Week 3"))
        .with_tags(vec![label("exam"), label("consensus")])
        .with_custom("lecturer", label("Dr Ada Lovelace"))
        .unwrap();

    Manifest::new(
        label("Raft Consensus"),
        OrderKey::first(),
        source,
        at(CREATED),
    )
    .with_facets(facets)
    .touched(at(UPDATED))
    .unwrap()
}

/// One of each annotation kind, so the discriminated union is covered.
fn canonical_annotations() -> AnnotationSet {
    let mut set = AnnotationSet::empty();

    set.insert(
        Annotation::text_highlight(
            AnnotationId::parse("hl-9f8a7b6c").unwrap(),
            PageNumber::new(4).unwrap(),
            HighlightSemantic::Key,
            Excerpt::parse("Raft achieves consensus via an elected leader.").unwrap(),
            vec![
                NormalizedRect::new(0.142, 0.285, 0.612, 0.032).unwrap(),
                NormalizedRect::new(0.098, 0.321, 0.244, 0.032).unwrap(),
            ],
            at(CREATED),
        )
        .unwrap(),
    )
    .unwrap();

    set.insert(Annotation::area_highlight(
        AnnotationId::parse("ar-1a2b3c4d").unwrap(),
        PageNumber::new(7).unwrap(),
        HighlightSemantic::Definition,
        NormalizedRect::new(0.2, 0.3, 0.4, 0.25).unwrap(),
        Some(Excerpt::parse("The leader election state machine").unwrap()),
        at(CREATED),
    ))
    .unwrap();

    set.insert(Annotation::text_box(
        AnnotationId::parse("tb-5e6f7a8b").unwrap(),
        PageNumber::new(7).unwrap(),
        NormalizedRect::new(0.55, 0.12, 0.3, 0.08).unwrap(),
        Excerpt::parse("Ask about the 2-phase commit comparison").unwrap(),
        at(UPDATED),
    ))
    .unwrap();

    set
}

#[test]
fn manifest_matches_the_committed_wire_format() {
    assert_matches_fixture("manifest.json", &to_file_bytes(&canonical_manifest()));
}

#[test]
fn annotations_match_the_committed_wire_format() {
    assert_matches_fixture("annotations.json", &to_file_bytes(&canonical_annotations()));
}

/// The fixtures are only a contract if they are also readable back.
#[test]
fn the_fixtures_round_trip_through_the_domain_types() {
    // Meaningless while the contract is being rewritten, and the parallel test runner
    // would otherwise race the two tests that do the rewriting.
    if std::env::var_os("UPDATE_FIXTURES").is_some() {
        return;
    }

    let manifest_bytes = fs::read(fixture_path("manifest.json")).unwrap();
    let manifest: Manifest = serde_json::from_slice(&manifest_bytes).unwrap();
    assert_eq!(manifest, canonical_manifest());

    let annotation_bytes = fs::read(fixture_path("annotations.json")).unwrap();
    let annotations: AnnotationSet = serde_json::from_slice(&annotation_bytes).unwrap();
    assert_eq!(annotations, canonical_annotations());
}
