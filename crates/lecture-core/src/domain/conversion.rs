//! How a document got to be a PDF, and the record of it that travels with the bundle.
//!
//! Split from [`source`](crate::domain::source) because the two answer different
//! questions. `Source` says what a bundle renders and what it was built from; this says
//! how far a conversion got and what did it. They change for different reasons: a new
//! converter touches this module, a new thing recorded about the document touches that
//! one.
//!
//! The provenance recorded here is what makes a synced bundle self-describing: an iPad
//! that cannot run `LibreOffice` can still see that this PDF came from a `.pptx` by way
//! of `LibreOffice` on 27 October, and can say so rather than guess.

use serde::{Deserialize, Serialize};

use crate::domain::{Label, Timestamp};

/// How far a document has got through conversion.
///
/// `Queued → Converting → Ready | Failed` is the progression; `NotRequired` is the
/// starting and final state of a document that arrived as a PDF already.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConversionState {
    /// Imported as a PDF, so nothing was converted.
    NotRequired,
    /// Accepted, not yet started.
    Queued,
    /// Conversion is running.
    Converting,
    /// Converted successfully.
    Ready,
    /// Conversion failed. The original is still there.
    Failed,
}

/// The provenance of a converted document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Conversion {
    /// How far conversion has got.
    state: ConversionState,

    /// Which converter produced the PDF, such as `libreoffice` or `keynote`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    converter: Option<Label>,

    /// When conversion finished.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    converted_at: Option<Timestamp>,
}

impl Conversion {
    /// A document that arrived as a PDF and needs no conversion.
    #[must_use]
    pub fn not_required() -> Self {
        Self {
            state: ConversionState::NotRequired,
            converter: None,
            converted_at: None,
        }
    }

    /// A conversion that has been accepted but not started.
    #[must_use]
    pub fn queued() -> Self {
        Self {
            state: ConversionState::Queued,
            converter: None,
            converted_at: None,
        }
    }

    /// A conversion that finished successfully.
    #[must_use]
    pub fn ready(converter: Label, at: Timestamp) -> Self {
        Self {
            state: ConversionState::Ready,
            converter: Some(converter),
            converted_at: Some(at),
        }
    }

    /// A conversion that failed.
    ///
    /// The failure reason is deliberately not stored here. It is machine-specific — a
    /// missing `LibreOffice`, a permissions problem — so it belongs in the diagnostics log
    /// rather than in a file that syncs to a device where it would be meaningless.
    #[must_use]
    pub fn failed(converter: Label) -> Self {
        Self {
            state: ConversionState::Failed,
            converter: Some(converter),
            converted_at: None,
        }
    }

    /// How far conversion has got.
    #[must_use]
    pub fn state(&self) -> ConversionState {
        self.state
    }

    /// Which converter was used, if any.
    #[must_use]
    pub fn converter(&self) -> Option<&Label> {
        self.converter.as_ref()
    }

    /// When conversion finished, if it has.
    #[must_use]
    pub fn converted_at(&self) -> Option<&Timestamp> {
        self.converted_at.as_ref()
    }
}
