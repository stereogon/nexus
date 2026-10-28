//! Turning an imported document into the PDF the viewer renders.
//!
//! # Why this is a port and not a module
//!
//! Converting a `.pptx` means running `LibreOffice`: a process, macOS-only, which
//! `CLAUDE.md` §3 forbids from existing inside `lecture-core` — the crate has to compile
//! for iPadOS, where it cannot run at all.
//!
//! A port rather than a direct call even though there is now exactly **one**
//! implementation, because the number of implementations was never the reason. The reason
//! is that `lecture-core` must compile where none of them can run.
//!
//! So the domain states *what* conversion is and *when* it may happen, and an adapter
//! supplies *how*. The iPad gets the same state machine without a single `#[cfg]`.
//!
//! # No converter is required
//!
//! A converter is **optional**. If none is installed, the import still succeeds: the
//! original is kept, the conversion stays `Queued`, and installing `LibreOffice` later
//! lets it proceed. That is why there is no `Unavailable` conversion state — see the note
//! on [`select_converter`].
//!
//! # Conversion happens once, at import
//!
//! Never on the way to the screen. A view-step converter would mean every page turn is a
//! possible conversion failure, and a lecture that opened yesterday failing to open today
//! because a tool was upgraded.

use crate::domain::{ConversionRequest, DocumentFormat, Label};
use crate::error::CoreError;

/// A capability that produces a PDF from some other document format.
pub trait DocumentConverterPort {
    /// What this converter is called in `manifest.json`.
    ///
    /// Recorded as provenance, so a synced bundle can say a PDF came from `.pptx` by way
    /// of `libreoffice` even on a device that has never had `LibreOffice` installed.
    fn label(&self) -> &Label;

    /// Whether this converter can handle `format`.
    fn supports(&self, format: DocumentFormat) -> bool;

    /// Converts the request's original into a PDF at its document path.
    ///
    /// Returning `Ok` means the PDF is there. An adapter writes it through the same atomic
    /// path everything else uses, so a conversion that dies partway leaves no fragment for
    /// someone to annotate.
    ///
    /// # Errors
    ///
    /// Returns a [`CoreError`] describing what went wrong. The original file must still be
    /// there afterwards either way: a failed conversion is a retryable state, not a lost
    /// document.
    fn convert(&self, request: &ConversionRequest) -> Result<(), CoreError>;
}

/// Picks the converter to use for `format`, or `None` if nothing can.
///
/// `converters` is in **preference order** and the first match wins. The preference is the
/// caller's to express rather than this function's: which tool produces better output is
/// knowledge about tools, and tool knowledge lives in the adapter layer. `CLAUDE.md` §3's
/// "`LibreOffice` CLI preferred when present" is therefore an ordering decision made where
/// the converters are assembled, not a name hardcoded in the domain.
///
/// # Why `None` rather than an `Unavailable` state
///
/// Milestone 2's plan listed `Unavailable` as a conversion state. It cannot be one. "No
/// converter is installed" is a fact about *this machine*, and `manifest.json` is a
/// **synced** file — a bundle marked `Unavailable` on an iPad would carry that back to the
/// Mac that could convert it perfectly. It is the same mistake the view-state amendment
/// corrected, in a new place.
///
/// So absence is answered at runtime and the persisted state stays `Queued`, which is both
/// true and useful: it is exactly what should happen when the converter arrives later.
#[must_use]
pub fn select_converter<'a>(
    converters: &[&'a dyn DocumentConverterPort],
    format: DocumentFormat,
) -> Option<&'a dyn DocumentConverterPort> {
    converters
        .iter()
        .copied()
        .find(|converter| converter.supports(format))
}
