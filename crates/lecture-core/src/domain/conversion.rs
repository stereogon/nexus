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
use crate::error::CoreError;

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

impl ConversionState {
    /// What to call this state in a message.
    ///
    /// A `&'static str` so [`CoreError`] can carry it without depending on this enum —
    /// the error type stays free of domain types, which is what lets it be matched on
    /// without pulling the domain in.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::NotRequired => "not required",
            Self::Queued => "queued",
            Self::Converting => "converting",
            Self::Ready => "ready",
            Self::Failed => "failed",
        }
    }
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

    /// Whether this conversion was running when the app last stopped.
    ///
    /// Nothing resumes a half-finished conversion, so finding `Converting` recorded on
    /// disk means the process died partway: the PDF beside it may be absent, truncated or
    /// a plausible-looking fragment. It is requeued rather than trusted, because a
    /// partial PDF that happens to open is the worst of the three outcomes — it would be
    /// annotated.
    #[must_use]
    pub fn was_interrupted(&self) -> bool {
        matches!(self.state, ConversionState::Converting)
    }

    /// Starts a conversion, recording which converter is attempting it.
    ///
    /// Allowed from `Queued` and from `Failed`, the second being a retry with whatever
    /// converter is available now — often the point of retrying at all, since the usual
    /// cause of failure is that no converter was installed.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::ConversionNotPossible`] from any other state.
    pub fn started(self, converter: Label) -> Result<Self, CoreError> {
        match self.state {
            ConversionState::Queued | ConversionState::Failed => Ok(Self {
                state: ConversionState::Converting,
                converter: Some(converter),
                converted_at: None,
            }),
            other => Err(refuse(other, "converting")),
        }
    }

    /// Records that the conversion produced a PDF.
    ///
    /// Only from `Converting`, which is what makes a crash detectable: every success has
    /// passed through a state written to disk first, so there is no path from "queued" to
    /// "done" that leaves no trace of having been attempted.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::ConversionNotPossible`] from any other state, or if no
    /// converter was recorded — a finished conversion that cannot say what produced it
    /// would leave a bundle unable to describe itself.
    pub fn succeeded(self, at: Timestamp) -> Result<Self, CoreError> {
        if self.state != ConversionState::Converting {
            return Err(refuse(self.state, "ready"));
        }

        let Some(converter) = self.converter else {
            return Err(refuse(self.state, "ready without naming a converter"));
        };

        Ok(Self::ready(converter, at))
    }

    /// Records that the conversion did not produce a PDF.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::ConversionNotPossible`] from any state but `Converting`.
    pub fn did_not_finish(self) -> Result<Self, CoreError> {
        match (self.state, self.converter) {
            (ConversionState::Converting, Some(converter)) => Ok(Self::failed(converter)),
            (ConversionState::Converting, None) => {
                Err(refuse(self.state, "failed without naming a converter"))
            }
            (other, _) => Err(refuse(other, "failed")),
        }
    }

    /// Puts the conversion back in the queue, forgetting the attempt.
    ///
    /// Two callers, one rule. An interrupted conversion is requeued at startup so it is
    /// retried rather than left looking as though it were still running on a process that
    /// no longer exists. A `Failed` one is requeued when someone asks to try again.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::ConversionNotPossible`] from `NotRequired`, `Queued` or
    /// `Ready`. A `Ready` conversion is not requeued by this — see
    /// [`Conversion::reconversion_requested`], which is a different intent and deserves a
    /// different name.
    pub fn requeued(self) -> Result<Self, CoreError> {
        match self.state {
            ConversionState::Converting | ConversionState::Failed => Ok(Self::queued()),
            other => Err(refuse(other, "queued")),
        }
    }

    /// Asks for a finished conversion to be done again.
    ///
    /// Separate from [`Conversion::requeued`] because the consequence is different and a
    /// caller should have to mean it: a reconversion replaces a PDF that highlights were
    /// already placed on, and their geometry is normalised against *that* document's
    /// pages. The recorded fingerprint is what lets the app notice afterwards and say so.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::ConversionNotPossible`] unless the conversion is `Ready`.
    /// `NotRequired` is refused too: a document that arrived as a PDF has no original to
    /// convert from, so there is nothing to redo.
    pub fn reconversion_requested(self) -> Result<Self, CoreError> {
        match self.state {
            ConversionState::Ready => Ok(Self::queued()),
            other => Err(refuse(other, "queued for reconversion")),
        }
    }
}

/// The one place a refused transition is described.
fn refuse(from: ConversionState, attempted: &'static str) -> CoreError {
    CoreError::ConversionNotPossible {
        from: from.name(),
        attempted,
    }
}
