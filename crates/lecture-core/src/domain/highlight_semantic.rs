//! What a highlight *means*, rather than what colour it is.
//!
//! # Why the meaning is stored and the colour is not
//!
//! The spec's example annotation stores `"color": "#FACC15"`. That contradicts the
//! spec's own feature list, which defines the four highlights semantically — "Yellow =
//! Key Concept, Green = Definition, Red = Exam/Important, Blue = Question" — and it
//! contradicts the locked palette in `CLAUDE.md` §3. (`#FACC15` is not even one of the
//! four locked colours.) Treated as a drafting error and amended; see `claude-spec.md`.
//!
//! Storing the colour loses information that cannot be recovered:
//!
//! - The *meaning* disappears. A stored `#E0523C` cannot be filtered as "exam material"
//!   without a reverse lookup that breaks the moment two semantics are near-neighbours.
//! - The palette becomes permanent. Retuning amber for contrast would leave every
//!   already-saved highlight on the old hex, so one vault would show two ambers.
//! - The K/D/E/Q glyph cannot be derived. `CLAUDE.md` §3 requires it precisely so the
//!   set does not rely on hue alone, which is what makes it usable for someone who
//!   cannot distinguish the reds from the greens.
//!
//! The enum carries no hex. Colour is a design token, so it belongs to whichever UI is
//! rendering — and the iPadOS app in Phase 2 maps this same enum to its own tokens
//! rather than inheriting a macOS stylesheet through the domain.

use serde::{Deserialize, Serialize};

/// What a highlight marks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HighlightSemantic {
    /// A key concept. Amber.
    Key,
    /// A definition. Green.
    Definition,
    /// Exam-relevant or otherwise important. Red.
    Exam,
    /// Something to come back to and resolve. Blue.
    Question,
}

impl HighlightSemantic {
    /// Every semantic, in palette order.
    ///
    /// Useful for building a swatch row without restating the list, which is how a fifth
    /// semantic would end up missing from the UI.
    #[must_use]
    pub const fn all() -> [Self; 4] {
        [Self::Key, Self::Definition, Self::Exam, Self::Question]
    }

    /// The letter drawn on the highlight.
    ///
    /// Required by `CLAUDE.md` §3 so the four semantics can be told apart without
    /// relying on hue. Not decoration: it is the accessibility guarantee.
    #[must_use]
    pub const fn glyph(self) -> char {
        match self {
            Self::Key => 'K',
            Self::Definition => 'D',
            Self::Exam => 'E',
            Self::Question => 'Q',
        }
    }

    /// A short name for menus and filters.
    #[must_use]
    pub const fn describe(self) -> &'static str {
        match self {
            Self::Key => "Key concept",
            Self::Definition => "Definition",
            Self::Exam => "Exam / important",
            Self::Question => "Question",
        }
    }
}
