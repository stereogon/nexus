//! Contract tests for resolving citations against an [`AnnotationSet`].
//!
//! The governing rule: an orphaned citation is **reported, never repaired**. The text
//! belongs to the person who typed it, and on a synced vault an orphan may simply mean
//! the notes arrived before the annotations.
//!
//! Scanning lives in `citation.rs`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use lecture_core::{
    Annotation, AnnotationId, AnnotationSet, CitationIndex, Excerpt, HighlightSemantic,
    NormalizedRect, PageNumber, Timestamp, citation_link,
};

fn id(raw: &str) -> AnnotationId {
    AnnotationId::parse(raw).unwrap()
}

fn annotations(ids: &[&str]) -> AnnotationSet {
    let mut set = AnnotationSet::empty();

    for (index, ident) in ids.iter().enumerate() {
        let page = u32::try_from(index + 1).unwrap();
        set.insert(
            Annotation::text_highlight(
                id(ident),
                PageNumber::new(page).unwrap(),
                HighlightSemantic::Key,
                Excerpt::parse("quoted text").unwrap(),
                vec![NormalizedRect::new(0.1, 0.1, 0.2, 0.05).unwrap()],
                Timestamp::parse("2026-10-27T16:00:00Z").unwrap(),
            )
            .unwrap(),
        )
        .unwrap();
    }

    set
}

/// The exact form the spec writes into `notes.md`.
/// Orphans are reported, never repaired.
#[test]
fn reports_a_citation_whose_annotation_is_gone() {
    let notes = "[kept](cite://hl-a) and [deleted](cite://hl-gone)\n";
    let index = CitationIndex::scan(notes);
    let set = annotations(&["hl-a"]);

    let orphans = index.orphans(&set);

    assert_eq!(orphans.len(), 1);
    assert_eq!(orphans.first().unwrap().id().as_str(), "hl-gone");
    assert_eq!(
        index.len(),
        2,
        "the orphan must still be in the index -- the text belongs to the person"
    );
}

#[test]
fn a_fully_linked_file_has_no_orphans() {
    let index = CitationIndex::scan("[a](cite://hl-a)\n[b](cite://hl-b)\n");
    let set = annotations(&["hl-a", "hl-b"]);

    assert!(index.orphans(&set).is_empty());
}

#[test]
fn finds_highlights_that_have_not_been_written_about() {
    // Not a problem: highlighting without writing is the common case. Useful for
    // offering "link this to your notes".
    let index = CitationIndex::scan("[a](cite://hl-a)\n");
    let set = annotations(&["hl-a", "hl-b", "hl-c"]);

    let unlinked: Vec<&str> = index.unlinked(&set).map(|a| a.id().as_str()).collect();

    assert_eq!(unlinked, ["hl-b", "hl-c"]);
}

#[test]
fn builds_a_link_the_scanner_reads_back() {
    // The two directions must agree, or a link written by the app would not resolve.
    let target = citation_link(&id("hl-9f8a7b6c"));
    assert_eq!(target, "cite://hl-9f8a7b6c");

    let index = CitationIndex::scan(&format!("[Slide/Page 4]({target})\n"));

    assert_eq!(index.len(), 1);
    assert_eq!(index.all().first().unwrap().id(), &id("hl-9f8a7b6c"));
}
