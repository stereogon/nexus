//! Moving a file's bytes past a fingerprinter without holding them all.
//!
//! Apart from the rest of [`AtomicFsStorage`](super::AtomicFsStorage) because it is a
//! different concern. Everything in the parent module reads or writes a small file whole —
//! a manifest, an annotation set — where holding the bytes costs nothing. These two move a
//! *document*, and lecture PDFs run to hundreds of megabytes, so the bytes are handled a
//! chunk at a time and never all at once.
//!
//! That is also what [`Fingerprinter`] is shaped for. Being a chunk sink rather than a
//! function over a slice is what lets the fingerprint fall out of a copy that was happening
//! anyway, instead of costing a second pass over the file.

use std::fs::File;
use std::io::{self, Read};
use std::path::Path;

use lecture_core::{CoreError, Fingerprint, Fingerprinter, RelativePath};

use super::AtomicFsStorage;
use crate::error::{io_error, render};
use crate::staging::StagingFile;

/// How much of a file is held in memory at once while it is streamed.
///
/// 64 KiB is large enough that the syscall overhead disappears and small enough that it
/// stays a buffer rather than a copy of the file.
const COPY_CHUNK: usize = 64 * 1024;

impl AtomicFsStorage {
    /// Streams an external file into the vault, fingerprinting it on the way past.
    ///
    /// The one method here that takes a real filesystem path, because the file being
    /// imported is by definition **outside** the vault — it is on someone's Desktop. It is
    /// only read; only the copy inside the vault is written.
    ///
    /// Streamed in [`COPY_CHUNK`]-sized pieces rather than read whole. Lecture PDFs run to
    /// hundreds of megabytes, and `read`-then-`write` would hold an entire deck in memory
    /// just to copy it. The fingerprint comes free from the same pass — the bytes are
    /// already going by — which is the reason [`Fingerprinter`] is a chunk sink rather than
    /// a function over a slice.
    ///
    /// Atomic like every other write here: built in a staging file, flushed, then renamed
    /// over the target, so a failure part-way leaves nothing behind.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] if `from` cannot be read or the copy cannot be written,
    /// and a containment error if `to` does not resolve safely inside the vault. In every
    /// failure case `to` is left exactly as it was.
    pub fn copy_in(&self, from: &Path, to: &RelativePath) -> Result<Fingerprint, CoreError> {
        let resolved = self.root.resolve(to)?;
        let mut source = File::open(from).map_err(|error| io_error("read", from, error))?;
        let mut staging = StagingFile::create(resolved.as_path())?;
        let mut fingerprinter = Fingerprinter::new();
        let mut buffer = vec![0_u8; COPY_CHUNK];

        loop {
            let read = source
                .read(&mut buffer)
                .map_err(|error| io_error("read", from, error))?;

            if read == 0 {
                break;
            }

            let chunk = chunk_of(&buffer, read, from)?;

            fingerprinter.write(chunk);
            staging.write_all(chunk)?;
        }

        staging.sync()?;
        staging.commit(resolved.as_path())?;

        Ok(fingerprinter.finish())
    }

    /// The fingerprint of a file already in the vault, without holding it in memory.
    ///
    /// Needed after a conversion, because the PDF a converter produced never went through
    /// [`AtomicFsStorage::copy_in`] — the converter wrote it directly.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] if the file cannot be read, and a containment error if
    /// `at` does not resolve safely inside the vault.
    pub fn fingerprint_of(&self, at: &RelativePath) -> Result<Fingerprint, CoreError> {
        let resolved = self.root.resolve(at)?;
        let path = resolved.as_path();
        let mut file = File::open(path).map_err(|error| io_error("read", path, error))?;
        let mut fingerprinter = Fingerprinter::new();
        let mut buffer = vec![0_u8; COPY_CHUNK];

        loop {
            let read = file
                .read(&mut buffer)
                .map_err(|error| io_error("read", path, error))?;

            if read == 0 {
                break;
            }

            fingerprinter.write(chunk_of(&buffer, read, path)?);
        }

        Ok(fingerprinter.finish())
    }
}

/// The filled part of a read buffer.
///
/// `read` returns how many bytes it wrote, which is never more than the buffer holds — but
/// §4 bans indexing that can panic, so the slice is taken fallibly and a buffer that
/// disagreed with its own `read` is reported rather than trusted.
fn chunk_of<'a>(buffer: &'a [u8], read: usize, path: &Path) -> Result<&'a [u8], CoreError> {
    buffer.get(..read).ok_or_else(|| CoreError::Io {
        operation: "read",
        path: render(path),
        source: io::Error::from(io::ErrorKind::UnexpectedEof),
    })
}
