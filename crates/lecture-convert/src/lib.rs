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
//! `LibreOffice` and driving `Keynote` through `osascript` is a different capability that
//! happens to need the filesystem, not a kind of file access.
//!
//! # Which converter to prefer is the caller's decision
//!
//! `lecture_core::select_converter` takes converters in preference order and the first one
//! that handles the format wins. `CLAUDE.md` §3's "`LibreOffice` CLI preferred when present"
//! is therefore expressed where the converters are assembled, not hardcoded here — and
//! `LibreOffice` deserves that preference for a concrete reason: it handles all four
//! formats, and it does not launch an application in front of the person.
//!
//! # What is not here
//!
//! No decision about *whether* to convert, *when*, or *what state that leaves a lecture
//! in. All of that is the domain's, in `lecture_core::Conversion` and
//! `lecture_core::select_converter`, so the iPad — which can run no converter at all —
//! gets the same state machine without a single `#[cfg]`.
//!
//! Both adapters expose a `command_arguments`, so the modules stay public rather than
//! being flattened into the crate root.

pub mod iwork;
pub mod libreoffice;
mod output;

pub use iwork::{IworkApp, IworkConverter};
pub use libreoffice::{CONVERTER_LABEL, LibreOfficeConverter, SOFFICE_BUNDLE_PATH};
