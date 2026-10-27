//! A single, safe path segment.
//!
//! Every folder and file name the app creates from untrusted input — a lecture title, a
//! pasted image's filename — becomes a [`Slug`] first. A `Slug` is always exactly one
//! segment: it can never contain a separator, so it cannot escape the directory it is
//! joined to. Containment of a multi-segment *path* is a separate concern, handled in
//! the storage layer.
//!
//! The rules are deliberately stricter than macOS requires, because this vault is built
//! to sync. A name that is legal on APFS but illegal on exFAT or Windows would sync
//! fine and then fail to materialise on the other device, which looks like data loss to
//! the person using it.

use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

use crate::error::CoreError;

/// Maximum length in bytes.
///
/// APFS and HFS+ both cap a single name at 255 bytes. Atomic writes stage their work at
/// `<name>.tmp.<uuid>`, which adds 41 bytes, and a recovery copy adds `.bak`. Capping
/// the name itself at 200 leaves room for both, so a long but legal lecture title can
/// never produce a staging path that the filesystem refuses — a failure that would
/// otherwise appear only at save time, with the person's work in the balance.
const MAX_BYTES: usize = 200;

/// Characters that are illegal in a name on some filesystem the vault may reach.
///
/// `/` is the POSIX separator; `:` was the classic Mac separator and Finder still
/// displays it as `/`; the rest are forbidden by Windows and exFAT.
const FORBIDDEN: &[char] = &['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

/// Invisible characters that are legal in a filename but let one name impersonate
/// another in the sidebar — right-to-left overrides, zero-width joiners, a BOM.
const INVISIBLE: &[char] = &[
    '\u{00AD}', '\u{200B}', '\u{200C}', '\u{200D}', '\u{200E}', '\u{200F}', '\u{202A}', '\u{202B}',
    '\u{202C}', '\u{202D}', '\u{202E}', '\u{2066}', '\u{2067}', '\u{2068}', '\u{2069}', '\u{FEFF}',
];

/// Characters that [`Slug::from_title`] treats as word separators rather than content.
///
/// Dashes and bullets of every width are included because a person writing
/// "CS454 — Lecture 4" means a separator there, not a character they want in the folder
/// name. [`Slug::parse`] still accepts these as ordinary content, so someone who
/// deliberately names a folder with an em-dash keeps it; only derivation is opinionated.
const SEPARATORS: &[char] = &[
    '-', '_', '\u{2010}', '\u{2011}', '\u{2012}', '\u{2013}', '\u{2014}', '\u{2015}', '\u{2212}',
    '\u{00B7}', '\u{2022}',
];

/// Device names Windows reserves, with or without an extension.
const RESERVED_STEMS: &[&str] = &[
    "con", "prn", "aux", "nul", "com0", "com1", "com2", "com3", "com4", "com5", "com6", "com7",
    "com8", "com9", "lpt0", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// A validated single path segment, normalized to NFC.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "String")]
pub struct Slug(String);

impl TryFrom<String> for Slug {
    type Error = CoreError;

    fn try_from(raw: String) -> Result<Self, Self::Error> {
        Self::parse(&raw)
    }
}

impl Slug {
    /// Validates `raw` as a single path segment, normalizing it to NFC.
    ///
    /// Normalization is **NFC, never NFKC**. NFKC folds compatibility characters, and
    /// some of those fold *into* ASCII punctuation — U+FF0F FULLWIDTH SOLIDUS becomes a
    /// plain `/`. Running NFKC here would therefore manufacture a path separator out of
    /// a name that did not contain one, which is a directory-traversal vector. The
    /// checks below also run strictly *after* normalization, so nothing normalization
    /// produces can slip past them.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidName`] if the name is empty, longer than 200 bytes,
    /// contains a control, invisible or filesystem-reserved character, is `.` or `..`,
    /// begins with `.` or `-`, begins or ends with whitespace, ends with `.`, or matches
    /// a Windows reserved device name.
    pub fn parse(raw: &str) -> Result<Self, CoreError> {
        let normalized: String = raw.nfc().collect();
        Self::validate(raw, &normalized)?;
        Ok(Self(normalized))
    }

    /// Derives a safe slug from a human-written title.
    ///
    /// Lowercases, turns runs of whitespace and punctuation into single hyphens, drops
    /// anything unusable, and truncates on a character boundary. Lowercasing is not
    /// cosmetic: APFS is case-insensitive by default, so `Raft` and `raft` would
    /// collide as folder names, and producing one case consistently avoids a collision
    /// the person never asked for.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidName`] if nothing usable survives — a title made
    /// only of emoji or punctuation, for instance.
    pub fn from_title(title: &str) -> Result<Self, CoreError> {
        let mut out = String::with_capacity(title.len());
        let mut separator_pending = false;

        for ch in title.nfc() {
            if ch.is_control() || INVISIBLE.contains(&ch) {
                continue;
            }
            if ch.is_whitespace() || FORBIDDEN.contains(&ch) || SEPARATORS.contains(&ch) {
                separator_pending = !out.is_empty();
                continue;
            }
            if separator_pending {
                out.push('-');
                separator_pending = false;
            }
            out.extend(ch.to_lowercase());
        }

        let trimmed = out.trim_matches(['-', '.']);
        let capped = truncate_on_boundary(trimmed, MAX_BYTES).trim_end_matches(['-', '.']);

        if capped.is_empty() {
            return Err(CoreError::InvalidName {
                name: title.to_owned(),
                reason: "contains no characters usable in a folder name",
            });
        }

        Self::parse(capped)
    }

    /// The segment as it should be written to disk.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    fn validate(original: &str, candidate: &str) -> Result<(), CoreError> {
        let reject = |reason: &'static str| {
            Err(CoreError::InvalidName {
                name: original.to_owned(),
                reason,
            })
        };

        if candidate.is_empty() {
            return reject("a name cannot be empty");
        }
        if candidate.len() > MAX_BYTES {
            return reject("longer than 200 bytes, which leaves no room for safe saving");
        }
        if candidate == "." || candidate == ".." {
            return reject("refers to a directory rather than naming one");
        }
        if candidate.starts_with('.') {
            return reject("a leading dot would hide it from Finder");
        }
        if candidate.starts_with('-') {
            return reject("a leading hyphen is read as an option by command-line tools");
        }
        if candidate.ends_with('.') {
            return reject("a trailing dot is silently dropped on some filesystems");
        }
        if candidate.starts_with(char::is_whitespace) || candidate.ends_with(char::is_whitespace) {
            return reject("leading or trailing spaces are invisible and easily lost");
        }
        if candidate.chars().any(char::is_control) {
            return reject("contains a control character");
        }
        if candidate.chars().any(|c| INVISIBLE.contains(&c)) {
            return reject("contains an invisible character that could disguise the name");
        }
        if candidate.chars().any(|c| FORBIDDEN.contains(&c)) {
            return reject("contains a character that is reserved on some filesystems");
        }
        if is_reserved_device_name(candidate) {
            return reject("matches a name Windows reserves for a device");
        }

        Ok(())
    }
}

/// True if the stem before the first dot is a Windows device name.
fn is_reserved_device_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name).to_ascii_lowercase();
    RESERVED_STEMS.contains(&stem.as_str())
}

/// Shortens `text` to at most `max_bytes`, never splitting a character.
fn truncate_on_boundary(text: &str, max_bytes: usize) -> &str {
    if text.len() <= max_bytes {
        return text;
    }
    let mut end = max_bytes;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    text.get(..end).unwrap_or("")
}
