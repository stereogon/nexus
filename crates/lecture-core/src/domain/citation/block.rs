//! The line "Link to Notes" writes into `notes.md`.
//!
//! `claude-spec.md` §2.4 gives the shape:
//!
//! ```markdown
//! > 📌 **[Page 4](cite://hl-9f8a7b6c)**: *"Exact sentence highlighted from the lecture..."*
//! ```
//!
//! Here, in `lecture-core`, rather than in the window, because it is part of what a
//! `notes.md` *is*: the iPad will read and write these lines too, and a second copy of the
//! format would drift from the first. The window builds the same text, and a contract
//! fixture written from this function holds the two together.
//!
//! "Page", not "Slide/Page": a bundle does not record whether its PDF was a deck, and the
//! word is a label for the reader, not something the scanner depends on. The scanner finds
//! the citation by its `cite://` target alone.

use crate::domain::{Annotation, citation_link};

/// The citation line for an annotation, ready to insert at the cursor.
///
/// The quote is the highlight's text, an area's caption, or a text box's text. An area
/// with no caption has nothing to quote, so its line is the link alone.
#[must_use]
pub fn citation_block(annotation: &Annotation) -> String {
    let link = format!(
        "> 📌 **[Page {}]({})**",
        annotation.page().get(),
        citation_link(annotation.id())
    );

    match annotation.text() {
        Some(text) => format!("{link}: *\"{}\"*", escaped(text.as_str())),
        None => link,
    }
}

/// Backslash-escapes what would otherwise change the meaning of the quote.
///
/// The quote sits inside `*…*`, so an asterisk or underscore in it would end the emphasis
/// early, a backtick would open a code span, and a bracket could start a link of its own.
/// An excerpt is already one line with its whitespace collapsed, so a newline cannot
/// break out of the blockquote.
fn escaped(quote: &str) -> String {
    let mut out = String::with_capacity(quote.len());

    for character in quote.chars() {
        if matches!(character, '\\' | '*' | '_' | '`' | '[' | ']' | '<') {
            out.push('\\');
        }
        out.push(character);
    }

    out
}
