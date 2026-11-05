//! Images pasted into the notes: which ones are kept, and what they are called.
//!
//! The format is read from the file's own first bytes, never from a name or a clipboard
//! type a sender chose. Four raster formats, and deliberately not SVG: an SVG is a
//! document that can carry script, and an image in a note should be a picture.
//!
//! The name is `claude-spec.md` §2.3's `<timestamp>-<hash>.<ext>`. The hash makes two
//! pastes of the same picture the same file rather than two copies, and the timestamp
//! keeps the folder in the order things were added when someone browses it in Finder.

use crate::domain::{Timestamp, fingerprint_hex};

/// The largest image kept, in bytes. A screenshot is a few megabytes; past this it is
/// almost certainly not something meant to sit in a note.
pub const MAX_ASSET_BYTES: usize = 25 * 1024 * 1024;

/// A raster format an image in the notes may have.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    /// Portable Network Graphics — what a macOS screenshot is.
    Png,
    /// JPEG, as photographs and many slides export.
    Jpeg,
    /// GIF.
    Gif,
    /// WebP.
    Webp,
}

impl ImageFormat {
    /// The format `bytes` are in, judged by their signature, or `None` if not one of these.
    #[must_use]
    pub fn sniff(bytes: &[u8]) -> Option<Self> {
        if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
            Some(Self::Png)
        } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
            Some(Self::Jpeg)
        } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
            Some(Self::Gif)
        } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
            Some(Self::Webp)
        } else {
            None
        }
    }

    /// The file extension, without its dot.
    #[must_use]
    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Gif => "gif",
            Self::Webp => "webp",
        }
    }
}

/// The file name an image is kept under: `YYYYMMDD-HHMMSS-<hash>.<ext>`.
///
/// The timestamp's digits only — a colon is not a safe character in a file name on every
/// system a vault may sync to.
#[must_use]
pub fn asset_file_name(at: &Timestamp, bytes: &[u8], format: ImageFormat) -> String {
    let digits: String = at.as_str().chars().filter(char::is_ascii_digit).collect();
    let (date, time) = digits.split_at(digits.len().min(8));

    format!(
        "{date}-{time}-{}.{}",
        fingerprint_hex(bytes),
        format.extension()
    )
}
