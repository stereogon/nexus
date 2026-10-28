//! Deciding whether a converter actually produced a PDF, and putting it in place.
//!
//! Apart from the adapter because the two concerns are different: how a converter is
//! invoked, against what counts as having succeeded. Kept separate after the second
//! adapter was removed, both because the seam is real and because folding it back would
//! put `libreoffice.rs` over the 300-line limit in `CLAUDE.md` §4.
//!
//! # Why the exit status is not enough
//!
//! `LibreOffice` exits 0 having written nothing when it has no filter for a document.
//! That would otherwise be recorded as a `Ready` conversion pointing at a file that is not
//! there — a lecture that imports cleanly and cannot be opened, with the cause
//! no longer visible by the time anyone notices.

use std::fs::{self, File};
use std::io::Read;
use std::path::Path;

use lecture_core::{ConversionRequest, CoreError, RelativePath, Slug};
use lecture_fs::AtomicFsStorage;

/// How every PDF begins.
const PDF_SIGNATURE: &[u8; 5] = b"%PDF-";

/// What is wrong with the file a converter left behind, if anything.
///
/// The reasons are a closed set of `&'static str` rather than anything taken from the
/// converter's own output. `CLAUDE.md` §4 forbids a person's file names reaching the log,
/// and a converter's stderr is full of them.
pub(crate) fn inspect(path: &Path) -> Option<&'static str> {
    // `symlink_metadata`, so a symlink is not accepted as the output: it would not be a
    // file the converter wrote, and nothing in this codebase follows one inside a vault.
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return Some("it reported success but wrote no PDF");
    };

    if !metadata.is_file() {
        return Some("it left something other than a file where the PDF should be");
    }

    if metadata.len() == 0 {
        return Some("it wrote an empty file instead of a PDF");
    }

    // Five bytes, not the file. A converted deck can run to hundreds of megabytes and
    // reading it to look at its first five would be absurd.
    let mut signature = [0_u8; PDF_SIGNATURE.len()];
    let read = File::open(path).and_then(|mut file| file.read_exact(&mut signature));

    match read {
        Err(_) => Some("it wrote a PDF that cannot be read back"),
        Ok(()) if signature == *PDF_SIGNATURE => None,
        Ok(()) => Some("it wrote a file that is not a PDF"),
    }
}

/// Checks what a converter produced and moves it onto `destination`.
///
/// `produced` and `destination` are both inside one vault, so the move is a
/// same-filesystem rename and therefore atomic: nothing ever sees a half-written
/// `document.pdf`, and nothing can annotate a fragment.
///
/// # Errors
///
/// Returns [`CoreError::ConversionFailed`] naming `converter` if the output is missing or
/// unusable, having first removed it — the converter's own leavings should not sit in a
/// lecture folder looking like something. Returns [`CoreError::Io`] or a containment error
/// if the move itself fails, in which case `destination` is untouched.
pub(crate) fn commit(
    storage: &AtomicFsStorage,
    produced: &RelativePath,
    destination: &RelativePath,
    converter: &str,
) -> Result<(), CoreError> {
    let written = storage.root().resolve(produced)?;

    if let Some(reason) = inspect(written.as_path()) {
        drop(fs::remove_file(written.as_path()));

        return Err(CoreError::ConversionFailed {
            converter: converter.to_owned(),
            reason,
        });
    }

    storage.replace(produced, destination)
}

/// Where a converter writes its PDF before it is moved into place.
///
/// Derived from the *original's* stem and placed in the destination's directory, because
/// that is what `soffice` does with `--outdir` and there is no choice about it.
///
/// Never the destination itself. A converter that dies partway would otherwise leave a
/// fragment at the path the manifest calls the document, and a fragment that opens is a
/// fragment that gets annotated.
///
/// # Errors
///
/// Returns [`CoreError::InvalidName`] if the derived name is not a usable one.
pub(crate) fn intermediate_path(request: &ConversionRequest) -> Result<RelativePath, CoreError> {
    let stem = request.original().name().as_str();
    let stem = stem.rsplit_once('.').map_or(stem, |(before, _)| before);
    let produced = Slug::parse(&format!("{stem}.pdf"))?;

    match request.document().parent() {
        Some(parent) => parent.child(produced),
        None => Ok(RelativePath::root_level(produced)),
    }
}
