//! Shared helpers for turning filesystem failures into [`CoreError`]s.
//!
//! Every `io::Error` that leaves this crate is wrapped with what was being attempted
//! and on what. "Permission denied" with no subject is not something anyone can act on,
//! least of all the tired student in `CLAUDE.md` §1.4.

use std::io;
use std::path::Path;

use lecture_core::CoreError;

/// Wraps an I/O failure with the operation and path that produced it.
///
/// `operation` completes the sentence "could not …", so it reads as
/// `could not write to the temporary file '/…'`.
pub(crate) fn io_error(operation: &'static str, path: &Path, source: io::Error) -> CoreError {
    CoreError::Io {
        operation,
        path: render(path),
        source,
    }
}

/// Renders a path for an error message.
pub(crate) fn render(path: &Path) -> String {
    path.display().to_string()
}
