//! Where a bundle's document came from, and how it got to be a PDF.
//!
//! PDF is the canonical render format, so every bundle has a `document` the viewer can
//! open. Anything imported in another format is converted once, at import, and the
//! original is kept beside it so reconversion stays possible — a conversion that turns
//! out badly must never be the end of the road for the file someone imported.
//!
//! The provenance recorded here is what makes a synced bundle self-describing: an iPad
//! that cannot run `LibreOffice` can still see that this PDF came from a `.pptx` by way
//! of `LibreOffice` on 27 October, and can say so rather than guess.

use serde::{Deserialize, Serialize};

use crate::domain::{Label, RelativePath, Timestamp};
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

/// The document a bundle renders, and what it was made from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "RawSource", into = "RawSource")]
pub struct Source {
    document: RelativePath,
    original: Option<RelativePath>,
    conversion: Conversion,
}

/// The on-disk shape, before cross-field checks.
///
/// Routing deserialisation through this means the invariants below hold for every
/// `Source` that exists, including ones read from a hand-edited file — the same pattern
/// the rest of this module uses.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RawSource {
    document: RelativePath,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    original: Option<RelativePath>,
    conversion: Conversion,
}

impl TryFrom<RawSource> for Source {
    type Error = CoreError;

    fn try_from(raw: RawSource) -> Result<Self, Self::Error> {
        Self::new(raw.document, raw.original, raw.conversion)
    }
}

impl From<Source> for RawSource {
    fn from(source: Source) -> Self {
        Self {
            document: source.document,
            original: source.original,
            conversion: source.conversion,
        }
    }
}

impl Source {
    /// Builds a source record, checking it describes something coherent.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidManifest`] if the conversion state contradicts the
    /// rest of the record — a conversion that is `Ready` with no converter named, or an
    /// unconverted document that nonetheless has an original beside it. These cannot
    /// arise from the constructors, only from a hand-edited or truncated file, and the
    /// point of refusing them is that no later code has to wonder which field to trust.
    pub fn new(
        document: RelativePath,
        original: Option<RelativePath>,
        conversion: Conversion,
    ) -> Result<Self, CoreError> {
        let invalid = |reason: &'static str| Err(CoreError::InvalidManifest { reason });

        match conversion.state() {
            ConversionState::NotRequired => {
                if original.is_some() {
                    return invalid(
                        "the document needed no conversion, so it should have no separate original",
                    );
                }
                if conversion.converter().is_some() || conversion.converted_at().is_some() {
                    return invalid("nothing was converted, so no converter should be recorded");
                }
            }
            ConversionState::Queued | ConversionState::Converting => {
                if original.is_none() {
                    return invalid("a conversion is in progress but the original is missing");
                }
                if conversion.converted_at().is_some() {
                    return invalid("a conversion still in progress cannot have finished");
                }
            }
            ConversionState::Ready => {
                if original.is_none() {
                    return invalid(
                        "a converted document must keep its original so it can be reconverted",
                    );
                }
                if conversion.converter().is_none() {
                    return invalid(
                        "a finished conversion must record which converter produced it",
                    );
                }
                if conversion.converted_at().is_none() {
                    return invalid("a finished conversion must record when it finished");
                }
            }
            ConversionState::Failed => {
                if original.is_none() {
                    return invalid("a failed conversion must still keep the original file");
                }
                if conversion.converted_at().is_some() {
                    return invalid("a failed conversion cannot also have finished");
                }
            }
        }

        if Some(&document) == original.as_ref() {
            return invalid("the original and the rendered document cannot be the same file");
        }

        Ok(Self {
            document,
            original,
            conversion,
        })
    }

    /// The PDF the viewer renders, relative to the bundle.
    #[must_use]
    pub fn document(&self) -> &RelativePath {
        &self.document
    }

    /// The originally imported file, if it was converted.
    #[must_use]
    pub fn original(&self) -> Option<&RelativePath> {
        self.original.as_ref()
    }

    /// The conversion provenance.
    #[must_use]
    pub fn conversion(&self) -> &Conversion {
        &self.conversion
    }
}
