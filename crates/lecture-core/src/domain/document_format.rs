//! The document formats a lecture can be imported from.
//!
//! PDF is the canonical render format, so this enum exists mainly to answer one question:
//! does this file need converting before the viewer can open it? Everything that is not
//! already a PDF does.
//!
//! The list is closed on purpose. An open "any extension" import would accept a `.zip` or
//! a `.mp4` and only discover at conversion time that nothing can read it, by which point
//! a bundle has been created and a person has been told their lecture imported.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// A format a document can arrive in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DocumentFormat {
    /// Already the canonical render format.
    Pdf,
    /// `PowerPoint`, current XML format.
    Pptx,
    /// `PowerPoint`, legacy binary format.
    Ppt,
    /// Word, current XML format.
    Docx,
    /// Word, legacy binary format.
    Doc,
}

impl DocumentFormat {
    /// Every format that can be imported, as a person would list them.
    pub const ALL: [Self; 5] = [Self::Pdf, Self::Pptx, Self::Ppt, Self::Docx, Self::Doc];

    /// Reads a format from a file extension, with or without a leading dot.
    ///
    /// Case is ignored, because a file from a lecturer's Windows machine is as likely to
    /// be `.PPTX` as `.pptx` and refusing it would be absurd.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::UnsupportedDocumentFormat`] for anything not in [`Self::ALL`].
    pub fn from_extension(raw: &str) -> Result<Self, CoreError> {
        let trimmed = raw.strip_prefix('.').unwrap_or(raw).to_ascii_lowercase();

        match trimmed.as_str() {
            "pdf" => Ok(Self::Pdf),
            "pptx" => Ok(Self::Pptx),
            "ppt" => Ok(Self::Ppt),
            "docx" => Ok(Self::Docx),
            "doc" => Ok(Self::Doc),
            _ => Err(CoreError::UnsupportedDocumentFormat { extension: trimmed }),
        }
    }

    /// The extension this format is stored under, without a dot.
    ///
    /// What `source/original.<ext>` is named with, so a reconversion years later can tell
    /// what it is holding without guessing from the bytes.
    #[must_use]
    pub const fn extension(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Pptx => "pptx",
            Self::Ppt => "ppt",
            Self::Docx => "docx",
            Self::Doc => "doc",
        }
    }

    /// Whether the viewer needs a converter before it can show this.
    #[must_use]
    pub const fn needs_conversion(self) -> bool {
        !matches!(self, Self::Pdf)
    }

    /// What to call this format to a person.
    #[must_use]
    pub const fn describe(self) -> &'static str {
        match self {
            Self::Pdf => "PDF",
            Self::Pptx | Self::Ppt => "PowerPoint",
            Self::Docx | Self::Doc => "Word",
        }
    }
}
