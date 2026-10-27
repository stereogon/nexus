//! `cite://<id>` — the link between a document and the notes beside it.
//!
//! This is the one value in a bundle that a person's *prose* depends on. Everything else
//! can be rebuilt from a vault scan; a citation is something they typed.
//!
//! # Line numbers, and the offsets this deliberately does not return
//!
//! A citation carries the **line** it sits on, counting from 1, and nothing finer. That
//! is what the bidirectional link needs: clicking a highlight scrolls the editor to the
//! line referencing it, and clicking a citation badge needs only the identifier that is
//! already under the cursor.
//!
//! A byte or character offset within the line was considered and rejected, because it
//! would be a cross-language trap rather than a convenience. Rust counts bytes, a
//! `char` is a Unicode scalar value, and `CodeMirror` counts UTF-16 code units — three
//! different numbers. The spec's own citation template contains an emoji (`📌`), so the
//! disagreement would not be hypothetical: every citation after it would be placed
//! wrongly. Line counting is the one measure both languages agree on.
//!
//! If in-line positioning is ever needed, it is a decision to make with the encoding
//! question faced directly, not something to inherit by accident.

mod scanner;

use std::collections::BTreeSet;
use std::num::NonZeroU32;

use crate::domain::{Annotation, AnnotationId, AnnotationSet};

use scanner::{FenceState, scan_line};

/// The scheme a citation is written under, for building links.
pub const CITATION_SCHEME: &str = scanner::SCHEME;

/// One `cite://<id>` occurrence in a notes file.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Citation {
    /// Ordered first so `Ord` sorts by position, which is the order a reader sees.
    line: NonZeroU32,
    id: AnnotationId,
}

impl Citation {
    /// What this citation points at.
    #[must_use]
    pub fn id(&self) -> &AnnotationId {
        &self.id
    }

    /// The line it appears on, counting from 1 as an editor numbers lines.
    #[must_use]
    pub fn line(&self) -> u32 {
        self.line.get()
    }

    /// The matching index into a zero-based array of lines.
    ///
    /// Provided so the conversion happens in one place rather than wherever it is
    /// needed, which is how off-by-one errors spread.
    #[must_use]
    pub fn zero_based_line_index(&self) -> usize {
        self.line.get() as usize - 1
    }
}

/// Every citation in one notes file, in the order they appear.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CitationIndex {
    citations: Vec<Citation>,
}

impl CitationIndex {
    /// Finds every citation in `notes`.
    ///
    /// Infallible by design. A malformed occurrence — `cite://` with nothing after it,
    /// or an identifier too long to be one — is skipped rather than reported, because it
    /// cannot refer to any annotation and there is nothing a person could do about it
    /// that the surrounding text does not already tell them. A citation that *is*
    /// well-formed but points at a missing annotation is a different matter, and
    /// [`Self::orphans`] reports those.
    #[must_use]
    pub fn scan(notes: &str) -> Self {
        let mut citations = Vec::new();
        let mut fences = FenceState::default();
        let mut ids = Vec::new();

        for (index, line) in notes.lines().enumerate() {
            if fences.consume(line) {
                continue;
            }

            ids.clear();
            scan_line(line, &mut ids);

            // `lines()` yields at most `u32::MAX` lines for any file that fits in
            // memory, and the index is zero-based, so the successor is always non-zero.
            let Ok(number) = u32::try_from(index + 1) else {
                break;
            };
            let Some(number) = NonZeroU32::new(number) else {
                break;
            };

            for id in &ids {
                if let Ok(id) = AnnotationId::parse(id) {
                    citations.push(Citation { line: number, id });
                }
            }
        }

        Self { citations }
    }

    /// Every citation, ordered by the line it appears on.
    #[must_use]
    pub fn all(&self) -> &[Citation] {
        &self.citations
    }

    /// How many citations there are, counting repeats of one identifier separately.
    #[must_use]
    pub fn len(&self) -> usize {
        self.citations.len()
    }

    /// Whether the notes cite nothing.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.citations.is_empty()
    }

    /// Every distinct identifier cited.
    #[must_use]
    pub fn cited_ids(&self) -> BTreeSet<&AnnotationId> {
        self.citations.iter().map(Citation::id).collect()
    }

    /// Every citation of `id`.
    ///
    /// The same highlight may legitimately be cited on several lines, so this returns
    /// all of them rather than assuming one.
    pub fn citations_of(&self, id: &AnnotationId) -> impl Iterator<Item = &Citation> {
        self.citations.iter().filter(move |c| c.id() == id)
    }

    /// The first line citing `id`, for scrolling the editor to it.
    #[must_use]
    pub fn first_line_of(&self, id: &AnnotationId) -> Option<u32> {
        self.citations_of(id).map(Citation::line).min()
    }

    /// Citations pointing at annotations that are not in `annotations`.
    ///
    /// These are **reported, never repaired**. An orphan usually means the highlight was
    /// deleted, or that a synced vault delivered the notes before the annotations — and
    /// in the second case the citation will start working on its own. Either way the
    /// text belongs to the person who typed it, so the UI's job is to show it as broken,
    /// not to remove it.
    #[must_use]
    pub fn orphans(&self, annotations: &AnnotationSet) -> Vec<&Citation> {
        self.citations
            .iter()
            .filter(|citation| annotations.get(citation.id()).is_none())
            .collect()
    }

    /// Annotations that no citation refers to.
    ///
    /// Not a problem: highlighting something without writing about it is the common
    /// case. Useful for offering "link this to your notes" on a highlight that has no
    /// link yet.
    pub fn unlinked<'a>(
        &'a self,
        annotations: &'a AnnotationSet,
    ) -> impl Iterator<Item = &'a Annotation> {
        let cited = self.cited_ids();

        annotations
            .all()
            .iter()
            .filter(move |annotation| !cited.contains(annotation.id()))
    }
}

/// Builds the link target for an annotation, as written into `notes.md`.
#[must_use]
pub fn citation_link(id: &AnnotationId) -> String {
    format!("{CITATION_SCHEME}{id}")
}
