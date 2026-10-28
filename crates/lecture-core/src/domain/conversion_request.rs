//! What a converter is being asked to do.
//!
//! A domain value rather than part of the port: it names paths and a format and performs
//! no I/O at all. Keeping it beside the trait would mean `domain` depended on `ports` as
//! soon as anything in the domain built one — and [`ImportPlan`](crate::domain::ImportPlan)
//! does exactly that.

use crate::domain::{DocumentFormat, RelativePath};
use crate::error::CoreError;

/// What a converter is being asked to do.
///
/// Both paths are relative to the vault, not absolute, because the domain does not know
/// where the vault is — the adapter resolves them against the root it owns, which is also
/// what keeps a request from naming somewhere outside the vault.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConversionRequest {
    original: RelativePath,
    format: DocumentFormat,
    document: RelativePath,
}

impl ConversionRequest {
    /// Asks for `original` to be converted into a PDF at `document`.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::UnsupportedDocumentFormat`] if `format` needs no conversion.
    /// Asking to convert a PDF into a PDF is a caller's mistake, and the honest answer is
    /// to refuse it rather than to copy the file and record a conversion that never
    /// happened.
    pub fn new(
        original: RelativePath,
        format: DocumentFormat,
        document: RelativePath,
    ) -> Result<Self, CoreError> {
        if !format.needs_conversion() {
            return Err(CoreError::UnsupportedDocumentFormat {
                extension: format.extension().to_owned(),
            });
        }

        Ok(Self {
            original,
            format,
            document,
        })
    }

    /// The file to read, relative to the vault.
    #[must_use]
    pub fn original(&self) -> &RelativePath {
        &self.original
    }

    /// What that file is.
    #[must_use]
    pub fn format(&self) -> DocumentFormat {
        self.format
    }

    /// Where the PDF must be written, relative to the vault.
    #[must_use]
    pub fn document(&self) -> &RelativePath {
        &self.document
    }
}
