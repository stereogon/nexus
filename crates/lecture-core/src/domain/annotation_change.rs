//! Changing an annotation that already exists.
//!
//! Apart from `annotation.rs`, which says what an annotation *is*, because a change has
//! a rule of its own that the rest of the type does not: **the id never moves.** The id is
//! what `cite://<id>` in the notes points at, so changing what a highlight means, or later
//! what a text box says, must leave every link to it working. Re-marking is the first such
//! change (2026-11-05); editing a text box's text and an area's caption belong here too.

use crate::domain::{Annotation, HighlightSemantic, Timestamp};

impl Annotation {
    /// This highlight marked as something else, changed at `at`; `None` for a text box.
    ///
    /// The id and the creation time are kept: the id is what `cite://<id>` in the notes
    /// points at, so changing what a highlight *means* must not change what it *is*.
    ///
    /// `updated_at` is never set earlier than `created_at`, even when `at` is. With two
    /// devices that is an ordinary case rather than a corrupt one — a clock a minute
    /// behind the device that made the highlight — and refusing it would make the change
    /// impossible on the slower device for no fault of the person using it.
    #[must_use]
    pub fn retagged(&self, semantic: HighlightSemantic, at: &Timestamp) -> Option<Self> {
        let mut changed = self.clone();

        match &mut changed {
            Self::TextHighlight {
                semantic: meaning,
                created_at,
                updated_at,
                ..
            }
            | Self::AreaHighlight {
                semantic: meaning,
                created_at,
                updated_at,
                ..
            } => {
                *meaning = semantic;
                *updated_at = at.max(created_at).clone();
            }
            Self::TextBox { .. } => return None,
        }

        Some(changed)
    }
}
