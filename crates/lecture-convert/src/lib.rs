//! Optional converter adapters for Nexus.
//!
//! # Why this is its own crate
//!
//! `CLAUDE.md` §3 says converters are **optional** adapters behind
//! `DocumentConverterPort`, and that neither is required for the app to function. A
//! separate crate makes that structural rather than aspirational: nothing depends on this
//! crate, so it can be removed from the workspace and the app still builds, still opens a
//! vault, and still imports PDFs. Only `.pptx` and `.docx` import stops working.
//!
//! It is also the honest boundary. `lecture-fs` is the filesystem adapter; spawning
//! `LibreOffice` and driving Keynote through `osascript` is a different capability that
//! happens to need the filesystem, not a kind of file access.
//!
//! # What is not here
//!
//! No decision about *whether* to convert, *when*, or *what state that leaves a lecture
//! in. All of that is the domain's, in `lecture_core::Conversion` and
//! `lecture_core::select_converter`, so the iPad — which can run no converter at all —
//! gets the same state machine without a single `#[cfg]`.

mod libreoffice;

pub use libreoffice::{
    CONVERTER_LABEL, LibreOfficeConverter, SOFFICE_BUNDLE_PATH, command_arguments,
};
