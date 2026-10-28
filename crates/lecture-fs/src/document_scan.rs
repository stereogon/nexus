//! Reading a document to see what it asks for, without holding it in memory.
//!
//! The whole file is read, because an indicator can sit anywhere in it, but never more
//! than one buffer at a time. A lecture PDF can be hundreds of megabytes and this runs
//! when one is opened, so "read it all into a `Vec`" is not available.
//!
//! `BufReader::fill_buf` is used rather than `read` into a slice of our own, which is not
//! a style preference: it hands back a `&[u8]` the reader owns, so there is no
//! `buffer[..read]` anywhere here, and §4 bans indexing that can panic.

use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use lecture_core::{CoreError, DocumentRisk, RiskScan};

use crate::error::io_error;

/// The bytes every PDF begins with.
///
/// Checked because a file named `.pdf` is not a PDF, and the viewer should be handed a
/// document or an error, never a surprise. A conversion that wrote something else is a
/// converter fault worth reporting rather than passing on.
const PDF_MAGIC: &[u8] = b"%PDF-";

/// How much is read at a time.
const CHUNK: usize = 64 * 1024;

/// What reading one document established.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentInspection {
    /// Whether it starts with the PDF signature.
    pub is_pdf: bool,
    /// Its size on disk.
    pub bytes: u64,
    /// The indicators found, worst first. Empty means *nothing found*, which is not the
    /// same as nothing there — see [`lecture_core::DocumentRisk`].
    pub risks: Vec<DocumentRisk>,
}

/// Reads the document at `path`, reporting its signature, size and indicators.
///
/// One pass and one open, because the three answers come from the same bytes and opening
/// the file twice would let it change in between.
///
/// # Errors
///
/// Returns [`CoreError::Io`] if the file cannot be opened or read.
pub fn inspect(path: &Path) -> Result<DocumentInspection, CoreError> {
    let file = File::open(path).map_err(|e| io_error("open the document", path, e))?;

    let bytes = file
        .metadata()
        .map_err(|e| io_error("measure the document", path, e))?
        .len();

    let mut reader = BufReader::with_capacity(CHUNK, file);
    let mut scan = RiskScan::new();
    let mut signature: Vec<u8> = Vec::with_capacity(PDF_MAGIC.len());

    loop {
        let chunk = reader
            .fill_buf()
            .map_err(|e| io_error("read the document", path, e))?;

        if chunk.is_empty() {
            break;
        }

        let read = chunk.len();

        // The signature may itself straddle a boundary, on a file whose first read is one
        // byte long. Taken by iterator so there is no slice arithmetic to get wrong.
        if signature.len() < PDF_MAGIC.len() {
            let wanted = PDF_MAGIC.len() - signature.len();
            signature.extend(chunk.iter().take(wanted));
        }

        scan.feed(chunk);
        reader.consume(read);
    }

    Ok(DocumentInspection {
        is_pdf: signature.starts_with(PDF_MAGIC),
        bytes,
        risks: scan.finish(),
    })
}
