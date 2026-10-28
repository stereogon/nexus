//! A stable, short, non-reversible reference to a value.
//!
//! Used in three places that need to say *which* bytes without saying what they are: a
//! folder name for this device's state, a reference to a failure in the log, and a record
//! in `manifest.json` of the document a lecture was built from.
//!
//! # FNV-1a (64-bit), and what it is and is not for
//!
//! Not cryptographic, and deliberately not. Every use here answers "have these bytes
//! changed?" about a person's own files on their own disk, in an app with no network. A
//! 64-bit fingerprint misses a change with probability around 5e-20, which is far below
//! the rate at which the disk itself lies.
//!
//! What it must **not** be used for is deciding whether to *trust* bytes — that someone
//! did not substitute a document for another. Nothing does that today, and nothing should
//! start without changing this to a cryptographic hash, which is a schema migration
//! because the fingerprints already written would all be wrong.
//!
//! It does need to be **stable across runs and builds**, which rules out
//! `std::collections::hash_map::DefaultHasher`: `std` explicitly does not guarantee its
//! output between versions, so a Rust upgrade would silently change every stored key.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// The FNV-1a 64-bit offset basis.
const OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;

/// The FNV-1a 64-bit prime.
const PRIME: u64 = 0x0000_0100_0000_01b3;

/// How many hex characters a fingerprint is written as.
const HEX_WIDTH: usize = 16;

/// A stable 64-bit fingerprint of `bytes`.
#[must_use]
pub fn fingerprint(bytes: &[u8]) -> u64 {
    let mut hasher = Fingerprinter::new();
    hasher.write(bytes);
    hasher.state
}

/// A stable 16-character hex fingerprint of `bytes`.
#[must_use]
pub fn fingerprint_hex(bytes: &[u8]) -> String {
    format!("{:0HEX_WIDTH$x}", fingerprint(bytes))
}

/// Fingerprints a value one chunk at a time.
///
/// Exists so a document can be fingerprinted without being held in memory. Lecture PDFs
/// run to hundreds of megabytes, and reading one whole file into a `Vec` to hash it would
/// make importing a large deck a memory spike for no reason.
///
/// The domain owns the algorithm and the adapter owns the reading, which is why this is a
/// chunk sink rather than something that takes a path.
#[derive(Debug, Clone)]
pub struct Fingerprinter {
    state: u64,
}

impl Default for Fingerprinter {
    fn default() -> Self {
        Self::new()
    }
}

impl Fingerprinter {
    /// A fresh fingerprinter.
    #[must_use]
    pub const fn new() -> Self {
        Self {
            state: OFFSET_BASIS,
        }
    }

    /// Folds `bytes` in.
    ///
    /// Chunk boundaries do not affect the result: FNV-1a folds one byte at a time, so any
    /// split of the same bytes gives the same fingerprint. There is a test for that,
    /// because it is the property that makes streaming equivalent to reading the lot.
    pub fn write(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.state ^= u64::from(*byte);
            self.state = self.state.wrapping_mul(PRIME);
        }
    }

    /// The fingerprint of everything written so far.
    #[must_use]
    pub const fn finish(self) -> Fingerprint {
        Fingerprint(self.state)
    }
}

/// A fingerprint of a file's contents, as stored in a manifest.
///
/// A named type rather than a `String` so that a hand-edited manifest cannot put arbitrary
/// text where a fingerprint belongs, and so that a comparison between a stored
/// fingerprint and a freshly computed one is a comparison of two of the same thing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct Fingerprint(u64);

impl Fingerprint {
    /// The fingerprint of `bytes`.
    #[must_use]
    pub fn of(bytes: &[u8]) -> Self {
        Self(fingerprint(bytes))
    }

    /// Reads a fingerprint back from its stored form.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidFingerprint`] unless `raw` is exactly
    /// [`HEX_WIDTH`] lowercase hex characters. Strict on purpose: a fingerprint that
    /// parsed loosely could compare unequal to the same file's real fingerprint and
    /// prompt someone to reconvert a document that never changed.
    pub fn parse(raw: &str) -> Result<Self, CoreError> {
        let invalid = || CoreError::InvalidFingerprint {
            value: raw.to_owned(),
        };

        if raw.len() != HEX_WIDTH
            || !raw
                .bytes()
                .all(|b| b.is_ascii_digit() || b"abcdef".contains(&b))
        {
            return Err(invalid());
        }

        u64::from_str_radix(raw, 16)
            .map(Self)
            .map_err(|_| invalid())
    }

    /// The stored form: 16 lowercase hex characters.
    #[must_use]
    pub fn as_hex(&self) -> String {
        format!("{:0HEX_WIDTH$x}", self.0)
    }
}

impl TryFrom<String> for Fingerprint {
    type Error = CoreError;

    fn try_from(raw: String) -> Result<Self, Self::Error> {
        Self::parse(&raw)
    }
}

impl From<Fingerprint> for String {
    fn from(fingerprint: Fingerprint) -> Self {
        fingerprint.as_hex()
    }
}
