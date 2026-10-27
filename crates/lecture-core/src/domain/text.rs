//! Character rules shared by every piece of human-supplied text.
//!
//! [`Slug`](crate::domain::Slug) names things on disk and [`Label`](crate::domain::Label)
//! names things on screen. They share the character *definitions* kept here, so a set
//! like [`INVISIBLE`] cannot drift into two versions, but they deliberately apply
//! different policies on top of them — see [`has_control`] against
//! [`has_non_whitespace_control`]. Sharing the vocabulary is the point; sharing the
//! verdict is not.

use unicode_normalization::UnicodeNormalization;

/// Invisible characters that are legal in text but let one string impersonate another.
///
/// Right-to-left and bidirectional overrides, zero-width joiners and spaces, a soft
/// hyphen, a byte-order mark. A name carrying one of these renders as something other
/// than what it is, which in a sidebar full of lecture titles is a way to hide a file.
pub(crate) const INVISIBLE: &[char] = &[
    '\u{00AD}', '\u{200B}', '\u{200C}', '\u{200D}', '\u{200E}', '\u{200F}', '\u{202A}', '\u{202B}',
    '\u{202C}', '\u{202D}', '\u{202E}', '\u{2066}', '\u{2067}', '\u{2068}', '\u{2069}', '\u{FEFF}',
];

/// Whether `ch` is one of the invisible characters listed in [`INVISIBLE`].
pub(crate) fn is_invisible(ch: char) -> bool {
    INVISIBLE.contains(&ch)
}

/// Whether `text` contains any control character at all.
///
/// Used for names on disk, where a tab or a newline inside a filename is pathological
/// however it got there.
pub(crate) fn has_control(text: &str) -> bool {
    text.chars().any(char::is_control)
}

/// Whether `text` contains a control character that is not whitespace.
///
/// Used for display text, where the distinction matters. A tab or a newline is both a
/// control character and whitespace, and it usually arrives because someone pasted a
/// title out of a PDF or a spreadsheet — refusing that would be hostile, so those are
/// collapsed as whitespace instead. `NUL`, `ESC` and the rest carry no such excuse and
/// are still refused.
pub(crate) fn has_non_whitespace_control(text: &str) -> bool {
    text.chars()
        .any(|ch| ch.is_control() && !ch.is_whitespace())
}

/// Whether `text` contains any of the invisible characters in [`INVISIBLE`].
pub(crate) fn has_invisible(text: &str) -> bool {
    text.chars().any(is_invisible)
}

/// Normalises human-supplied text for storage and display.
///
/// NFC, then outer whitespace trimmed, then inner whitespace runs collapsed to a single
/// space. Shared by [`Label`](crate::domain::Label) and
/// [`Excerpt`](crate::domain::Excerpt) because both need the same thing for the same
/// reason: text that looks identical to a person must compare equal, and text pulled out
/// of a PDF arrives with ragged line breaks that mean nothing.
///
/// NFC and never NFKC. NFKC folds compatibility characters in ways that change what the
/// text says, and in `Slug` it would go further and manufacture a path separator.
pub(crate) fn normalise(raw: &str) -> String {
    let normalised: String = raw.nfc().collect();

    let mut out = String::with_capacity(normalised.len());
    let mut pending_space = false;

    for ch in normalised.chars() {
        if ch.is_whitespace() {
            // Only becomes a space if real text follows, which trims both ends without
            // needing a second pass.
            pending_space = !out.is_empty();
            continue;
        }
        if pending_space {
            out.push(' ');
            pending_space = false;
        }
        out.push(ch);
    }

    out
}
