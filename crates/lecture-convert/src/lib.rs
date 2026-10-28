//! The optional `LibreOffice` converter adapter for Nexus.
//!
//! # Why this is its own crate
//!
//! `CLAUDE.md` §3 says converters are **optional** adapters behind
//! `DocumentConverterPort`, and that none is required for the app to function. A separate
//! crate makes that structural rather than aspirational: nothing depends on this crate, so
//! it can be removed from the workspace and the app still builds, still opens a vault, and
//! still imports PDFs. Only `.pptx` and `.docx` import stops working.
//!
//! It is also the honest boundary. `lecture-fs` is the filesystem adapter; spawning
//! `LibreOffice` is a different capability that happens to need the filesystem, not a kind
//! of file access.
//!
//! # `LibreOffice` is the only converter
//!
//! An `osascript` fallback through Keynote and Pages was built and then removed on
//! 2026-10-28, by the user's decision after it was tried against the real applications.
//! Reasoning in `PROGRESS.md`; the spec is amended beside the original requirement.
//!
//! The consequence is that the setup diagnostic is **load-bearing** rather than a
//! courtesy: with no second converter, a machine without `LibreOffice` can import nothing
//! but PDFs, and the only thing that makes that recoverable is telling the person plainly
//! how to install it.
//!
//! # What is not here
//!
//! No decision about *whether* to convert, *when*, or *what state that leaves a lecture
//! in. All of that is the domain's, in `lecture_core::Conversion` and
//! `lecture_core::select_converter`, so the iPad — which can run no converter at all — gets
//! the same state machine without a single `#[cfg]`.

pub mod libreoffice;
mod output;

pub use libreoffice::{CONVERTER_LABEL, LibreOfficeConverter, SOFFICE_BUNDLE_PATH};
