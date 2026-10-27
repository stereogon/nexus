//! Finding `cite://<id>` in Markdown prose.
//!
//! # Why this is not a regex over the whole file
//!
//! A `cite://` inside a code fence is an *example*, not a link. Treating it as live
//! would scroll the viewer to the wrong place, and if citations are ever rewritten —
//! marking an orphan, say — it would edit someone's code sample. So fenced blocks and
//! inline code spans are skipped.
//!
//! # Known limitation
//!
//! Indented (four-space) code blocks are **not** detected. Distinguishing one from a
//! list continuation or a wrapped paragraph needs real Markdown block parsing, and
//! pulling in a Markdown parser for this is out of proportion to the problem. Fenced and
//! inline code cover the cases that occur in practice; a `cite://` inside an indented
//! block will be read as a live citation. Recorded in `PROGRESS.md` rather than left as
//! a surprise.

/// The scheme every citation is written under.
///
/// Matched case-sensitively. The app only ever writes lowercase, and accepting variants
/// would mean an orphan report could not tell a typo from a real citation.
pub(super) const SCHEME: &str = "cite://";

/// Characters that may appear in an identifier.
///
/// Matches `AnnotationId`'s alphabet, which is the set needing no escaping in a URL.
/// Taking the *maximal* run of these is what makes `[text](cite://hl-abc)` yield
/// `hl-abc`: the `)` is not in the set, so it terminates the identifier naturally.
fn is_id_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_'
}

/// Tracks whether we are inside a fenced code block, across lines.
#[derive(Debug, Default)]
pub(super) struct FenceState {
    /// The fence character and its length, while open.
    open: Option<(u8, usize)>,
}

impl FenceState {
    /// Updates the state for `line` and reports whether the line's content is code.
    ///
    /// A fence line is itself never scanned for citations, so the return covers both
    /// the delimiters and the block body.
    pub(super) fn consume(&mut self, line: &str) -> bool {
        // CommonMark allows up to three spaces of indentation before a fence.
        let trimmed = line.trim_start_matches(' ');
        if line.len() - trimmed.len() > 3 {
            return self.open.is_some();
        }

        let Some(fence) = leading_fence(trimmed) else {
            return self.open.is_some();
        };
        let (character, length) = fence;

        match self.open {
            // A closing fence must use the same character, be at least as long, and
            // carry no info string.
            Some((open_char, open_len))
                if character == open_char
                    && length >= open_len
                    && trimmed
                        .get(length..)
                        .is_none_or(|rest| rest.trim().is_empty()) =>
            {
                self.open = None;
                true
            }
            Some(_) => true,
            None => {
                self.open = Some((character, length));
                true
            }
        }
    }
}

/// The fence character and run length, if `line` starts with one.
fn leading_fence(line: &str) -> Option<(u8, usize)> {
    let bytes = line.as_bytes();
    let character = *bytes.first()?;

    if character != b'`' && character != b'~' {
        return None;
    }

    let length = bytes.iter().take_while(|&&b| b == character).count();
    (length >= 3).then_some((character, length))
}

/// Appends every identifier cited on `line`, skipping inline code spans.
pub(super) fn scan_line(line: &str, out: &mut Vec<String>) {
    let bytes = line.as_bytes();
    let mut at = 0;

    while at < bytes.len() {
        let Some(&byte) = bytes.get(at) else { break };

        if byte == b'`' {
            at = skip_code_span(bytes, at);
            continue;
        }

        if line.get(at..).is_some_and(|rest| rest.starts_with(SCHEME)) {
            let id_start = at + SCHEME.len();
            let id_end = id_start
                + bytes.get(id_start..).map_or(0, |rest| {
                    rest.iter().take_while(|&&b| is_id_byte(b)).count()
                });

            if let Some(id) = line.get(id_start..id_end).filter(|id| !id.is_empty()) {
                out.push(id.to_owned());
            }

            // Continue past the identifier, not past the scheme, so a `cite://` inside
            // an identifier cannot be found a second time.
            at = id_end.max(id_start);
            continue;
        }

        at += 1;
    }
}

/// The index just past the inline code span opening at `at`.
///
/// A span opened by a run of `n` backticks is closed by a run of exactly `n`. If no such
/// run follows, the backticks are literal text and only they are skipped.
fn skip_code_span(bytes: &[u8], at: usize) -> usize {
    let opening = bytes
        .get(at..)
        .map_or(0, |rest| rest.iter().take_while(|&&b| b == b'`').count());
    let mut cursor = at + opening;

    while cursor < bytes.len() {
        if bytes.get(cursor) == Some(&b'`') {
            let run = bytes
                .get(cursor..)
                .map_or(0, |rest| rest.iter().take_while(|&&b| b == b'`').count());

            if run == opening {
                return cursor + run;
            }
            cursor += run;
            continue;
        }
        cursor += 1;
    }

    // Unterminated: the backticks were literal, so resume immediately after them.
    at + opening
}
