//! Where a bundle's document came from.
//!
//! PDF is the canonical render format, so every bundle has a `document` the viewer can
//! open. Anything imported in another format is converted once, at import, and the
//! original is kept beside it so reconversion stays possible — a conversion that turns
//! out badly must never be the end of the road for the file someone imported.
//!
//! How that conversion went is [`Conversion`](crate::domain::Conversion), in its own
//! module.

use serde::{Deserialize, Serialize};

use crate::domain::{Conversion, ConversionState, Fingerprint, RelativePath};
use crate::error::CoreError;

/// The document a bundle renders, and what it was made from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "RawSource", into = "RawSource")]
pub struct Source {
    document: RelativePath,
    document_fingerprint: Option<Fingerprint>,
    original: Option<RelativePath>,
    original_fingerprint: Option<Fingerprint>,
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
    document_fingerprint: Option<Fingerprint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    original: Option<RelativePath>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    original_fingerprint: Option<Fingerprint>,
    conversion: Conversion,
}

impl TryFrom<RawSource> for Source {
    type Error = CoreError;

    fn try_from(raw: RawSource) -> Result<Self, Self::Error> {
        Self::new(raw.document, raw.original, raw.conversion)?
            .with_fingerprints(raw.document_fingerprint, raw.original_fingerprint)
    }
}

impl From<Source> for RawSource {
    fn from(source: Source) -> Self {
        Self {
            document: source.document,
            document_fingerprint: source.document_fingerprint,
            original: source.original,
            original_fingerprint: source.original_fingerprint,
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
            document_fingerprint: None,
            original,
            original_fingerprint: None,
            conversion,
        })
    }

    /// Records fingerprints of the files this source names.
    ///
    /// Separate from [`Source::new`] because the two happen at different times and in
    /// different places: `new` states what a lecture *is*, which the domain settles on its
    /// own, while a fingerprint requires reading a file, which only an adapter can do.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidManifest`] if a fingerprint is given for an original
    /// that does not exist. A fingerprint with nothing to be a fingerprint *of* is the one
    /// shape here that could silently mislead — a later "has the original changed?" check
    /// would have something to compare and no file to compare it to.
    pub fn with_fingerprints(
        mut self,
        document: Option<Fingerprint>,
        original: Option<Fingerprint>,
    ) -> Result<Self, CoreError> {
        if original.is_some() && self.original.is_none() {
            return Err(CoreError::InvalidManifest {
                reason: "a fingerprint was recorded for an original file that is not there",
            });
        }

        self.document_fingerprint = document;
        self.original_fingerprint = original;

        Ok(self)
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

    /// A fingerprint of the rendered PDF, if one has been taken.
    ///
    /// `None` means nothing has read the file yet, not that it is unchanged. The
    /// distinction matters: annotation geometry is normalised against this document's
    /// pages, so a PDF that changed underneath a set of highlights puts them in the wrong
    /// place, and "we do not know" must not be reported as "it is fine".
    #[must_use]
    pub fn document_fingerprint(&self) -> Option<&Fingerprint> {
        self.document_fingerprint.as_ref()
    }

    /// A fingerprint of the originally imported file, if one has been taken.
    ///
    /// What makes "the source changed, reconvert?" answerable without keeping a second
    /// copy of the file to compare against.
    #[must_use]
    pub fn original_fingerprint(&self) -> Option<&Fingerprint> {
        self.original_fingerprint.as_ref()
    }

    /// Whether [`Source::document`] is a file that exists rather than one a conversion
    /// has still to produce.
    ///
    /// Worth a named method because the alternative is every caller matching on the
    /// conversion state and one of them getting it wrong. While a conversion is queued,
    /// running or failed, `document` names the PDF that *will* be written — the path is a
    /// promise, not a fact — and opening it would show an error or, worse, a fragment.
    #[must_use]
    pub fn document_is_ready(&self) -> bool {
        matches!(
            self.conversion.state(),
            ConversionState::NotRequired | ConversionState::Ready
        )
    }

    /// The conversion provenance.
    #[must_use]
    pub fn conversion(&self) -> &Conversion {
        &self.conversion
    }
}
