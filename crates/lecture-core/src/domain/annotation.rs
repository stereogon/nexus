//! `annotations.json`: what someone marked on a document.
//!
//! # Shape, and why it differs from the spec's example
//!
//! The spec sketches one wide record carrying every field, with `"freeText": null` on a
//! highlight and a separate top-level `"inkStrokes": []`. Three deliberate departures,
//! each noted in `claude-spec.md`:
//!
//! 1. **A tagged enum instead of a wide record.** In the flat shape nothing stops a file
//!    claiming `kind: "textHighlight"` while carrying a text box's `freeText` and no
//!    rectangles — the invariants become checks that someone has to remember to run.
//!    Here each kind carries exactly its own fields, so the contradictory file cannot be
//!    described, let alone loaded.
//! 2. **No stored `boundingRect`.** It is the union of `rects`, so storing it as well is
//!    two sources of one truth. Derived on demand instead.
//! 3. **No `documentId` and no `inkStrokes`.** See the notes on [`AnnotationSet`].
//!
//! # Coordinates
//!
//! Every rectangle is a [`NormalizedRect`] — fractions of the **unscaled** page. This is
//! the rule that makes a highlight land in the same place on a 14-inch laptop, a 4K
//! display, and an iPad, and it is enforced by the type rather than by convention.

use serde::{Deserialize, Serialize};

use crate::domain::{
    AnnotationId, Excerpt, HighlightSemantic, NormalizedRect, PageNumber, Timestamp,
};
use crate::error::CoreError;

/// Something a person marked on a page.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Annotation {
    /// Text selected on the page, highlighted in one of the four semantics.
    #[serde(rename_all = "camelCase")]
    TextHighlight {
        /// What `cite://<id>` in the notes points at.
        id: AnnotationId,
        /// The page this sits on, counting from 1.
        page: PageNumber,
        /// What the highlight marks.
        semantic: HighlightSemantic,
        /// The text covered, so a citation can show it without reopening the PDF.
        quote: Excerpt,
        /// One rectangle per line of selected text. Never empty.
        rects: Vec<NormalizedRect>,
        /// When it was made.
        created_at: Timestamp,
        /// When it was last changed.
        updated_at: Timestamp,
    },

    /// A box drawn around a diagram, an equation, or a scanned region.
    #[serde(rename_all = "camelCase")]
    AreaHighlight {
        /// What `cite://<id>` in the notes points at.
        id: AnnotationId,
        /// The page this sits on, counting from 1.
        page: PageNumber,
        /// What the highlight marks.
        semantic: HighlightSemantic,
        /// The region covered.
        region: NormalizedRect,
        /// An optional caption, since a diagram has no text to quote.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        caption: Option<Excerpt>,
        /// When it was made.
        created_at: Timestamp,
        /// When it was last changed.
        updated_at: Timestamp,
    },

    /// Text typed directly onto the page.
    #[serde(rename_all = "camelCase")]
    TextBox {
        /// What `cite://<id>` in the notes points at.
        id: AnnotationId,
        /// The page this sits on, counting from 1.
        page: PageNumber,
        /// Where the box sits and how big it is.
        region: NormalizedRect,
        /// What was typed.
        text: Excerpt,
        /// When it was made.
        created_at: Timestamp,
        /// When it was last changed.
        updated_at: Timestamp,
    },
}

impl Annotation {
    /// A highlight over selected text.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidAnnotation`] if `rects` is empty — a text highlight
    /// covering no part of the page could never be drawn or linked to — or if the
    /// timestamps are out of order.
    pub fn text_highlight(
        id: AnnotationId,
        page: PageNumber,
        semantic: HighlightSemantic,
        quote: Excerpt,
        rects: Vec<NormalizedRect>,
        at: Timestamp,
    ) -> Result<Self, CoreError> {
        if rects.is_empty() {
            return Err(CoreError::InvalidAnnotation {
                reason: "a text highlight must cover at least one rectangle",
            });
        }

        Ok(Self::TextHighlight {
            id,
            page,
            semantic,
            quote,
            rects,
            created_at: at.clone(),
            updated_at: at,
        })
    }

    /// A highlight over a region of the page.
    #[must_use]
    pub fn area_highlight(
        id: AnnotationId,
        page: PageNumber,
        semantic: HighlightSemantic,
        region: NormalizedRect,
        caption: Option<Excerpt>,
        at: Timestamp,
    ) -> Self {
        Self::AreaHighlight {
            id,
            page,
            semantic,
            region,
            caption,
            created_at: at.clone(),
            updated_at: at,
        }
    }

    /// Text typed onto the page.
    #[must_use]
    pub fn text_box(
        id: AnnotationId,
        page: PageNumber,
        region: NormalizedRect,
        text: Excerpt,
        at: Timestamp,
    ) -> Self {
        Self::TextBox {
            id,
            page,
            region,
            text,
            created_at: at.clone(),
            updated_at: at,
        }
    }

    /// What `cite://<id>` points at.
    #[must_use]
    pub fn id(&self) -> &AnnotationId {
        match self {
            Self::TextHighlight { id, .. }
            | Self::AreaHighlight { id, .. }
            | Self::TextBox { id, .. } => id,
        }
    }

    /// The page this sits on, counting from 1.
    #[must_use]
    pub fn page(&self) -> PageNumber {
        match self {
            Self::TextHighlight { page, .. }
            | Self::AreaHighlight { page, .. }
            | Self::TextBox { page, .. } => *page,
        }
    }

    /// What the highlight marks, or `None` for a text box.
    #[must_use]
    pub fn semantic(&self) -> Option<HighlightSemantic> {
        match self {
            Self::TextHighlight { semantic, .. } | Self::AreaHighlight { semantic, .. } => {
                Some(*semantic)
            }
            Self::TextBox { .. } => None,
        }
    }

    /// When this was made.
    #[must_use]
    pub fn created_at(&self) -> &Timestamp {
        match self {
            Self::TextHighlight { created_at, .. }
            | Self::AreaHighlight { created_at, .. }
            | Self::TextBox { created_at, .. } => created_at,
        }
    }

    /// When this was last changed.
    #[must_use]
    pub fn updated_at(&self) -> &Timestamp {
        match self {
            Self::TextHighlight { updated_at, .. }
            | Self::AreaHighlight { updated_at, .. }
            | Self::TextBox { updated_at, .. } => updated_at,
        }
    }

    /// The box a deep link centres on.
    ///
    /// Derived, never stored. For a text highlight it is the union of the line
    /// rectangles; for the others it is the region itself.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidCoordinate`] only if a text highlight somehow holds
    /// no rectangles, which the constructor and the deserialiser both refuse.
    pub fn bounding_rect(&self) -> Result<NormalizedRect, CoreError> {
        match self {
            Self::TextHighlight { rects, .. } => NormalizedRect::bounding(rects),
            Self::AreaHighlight { region, .. } | Self::TextBox { region, .. } => Ok(*region),
        }
    }

    /// The text this annotation carries, if any.
    ///
    /// The quote for a text highlight, the caption for an area highlight, the typed text
    /// for a text box. Used by search, which should not care which kind it found.
    #[must_use]
    pub fn text(&self) -> Option<&Excerpt> {
        match self {
            Self::TextHighlight { quote, .. } => Some(quote),
            Self::AreaHighlight { caption, .. } => caption.as_ref(),
            Self::TextBox { text, .. } => Some(text),
        }
    }

    /// Checks the invariants serde cannot see.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidAnnotation`] if a text highlight holds no rectangles,
    /// or if the annotation claims to have been changed before it was made.
    pub fn validate(&self) -> Result<(), CoreError> {
        if let Self::TextHighlight { rects, .. } = self
            && rects.is_empty()
        {
            return Err(CoreError::InvalidAnnotation {
                reason: "a text highlight must cover at least one rectangle",
            });
        }

        if self.created_at() > self.updated_at() {
            return Err(CoreError::InvalidAnnotation {
                reason: "an annotation cannot have been changed before it was made",
            });
        }

        Ok(())
    }
}
