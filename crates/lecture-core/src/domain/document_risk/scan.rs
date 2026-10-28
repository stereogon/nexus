//! The scan itself: a resumable state machine over PDF name tokens.
//!
//! # Why names rather than a substring search
//!
//! Searching the bytes for `"/JavaScript"` is both evadable and noisy. A PDF name may
//! write any of its characters as a `#` hex escape, so `/J#61vaScript` is the *same name*
//! to every reader and invisible to a substring search — which makes the obvious
//! implementation one an attacker steps around by typing three characters. Decoding names
//! properly also means `/JavaScriptFoo` no longer counts as `/JavaScript`.
//!
//! # Why resumable
//!
//! A lecture PDF can be hundreds of megabytes, so the caller streams it in chunks and this
//! holds the partial name across the boundary. Feeding the same bytes split at any offset
//! must give the same answer, and there is a test that feeds one input at every possible
//! split to prove it.

use std::collections::BTreeSet;

use super::DocumentRisk;

/// The longest name worth keeping, in decoded bytes.
///
/// The longest token matched is `EmbeddedFile` at twelve, so this is generous. A name
/// running past it cannot be one of ours, so it is marked unmatchable and its bytes
/// dropped — which is also what keeps memory bounded on a file that opens a name and never
/// closes it.
const LONGEST_NAME: usize = 32;

/// How far into a `#xx` escape the scan is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum State {
    /// Not inside a name.
    Outside,
    /// Reading a name's characters.
    InName,
    /// Just read `#`; the next two bytes should be hex digits.
    AfterHash,
    /// Read `#` and one hex digit, held here until its pair arrives.
    AfterHashDigit(u8),
}

/// Accumulates [`DocumentRisk`]s from a document's bytes, a chunk at a time.
#[derive(Debug)]
pub struct RiskScan {
    found: BTreeSet<DocumentRisk>,
    name: Vec<u8>,
    /// Set when the current name cannot be one we match — too long, or a malformed escape.
    /// Checked instead of guessing at a repair, because a name Nexus cannot read exactly is
    /// a name it must not claim to have recognised.
    unmatchable: bool,
    state: State,
}

impl Default for RiskScan {
    fn default() -> Self {
        Self::new()
    }
}

impl RiskScan {
    /// A scan that has seen nothing.
    #[must_use]
    pub fn new() -> Self {
        Self {
            found: BTreeSet::new(),
            name: Vec::new(),
            unmatchable: false,
            state: State::Outside,
        }
    }

    /// Reads one chunk. Call it as many times as there are chunks, in order.
    pub fn feed(&mut self, chunk: &[u8]) {
        for byte in chunk {
            self.step(*byte);
        }
    }

    /// Everything found, worst first.
    ///
    /// End of file closes any name still open, so a document ending mid-name — truncated,
    /// or simply without trailing whitespace — is read the same as one that does not.
    #[must_use]
    pub fn finish(mut self) -> Vec<DocumentRisk> {
        self.close_name();

        self.found.into_iter().collect()
    }

    fn step(&mut self, byte: u8) {
        match self.state {
            State::Outside => {
                if byte == b'/' {
                    self.open_name();
                }
            }
            State::InName => self.in_name(byte),
            State::AfterHash => {
                if let Some(high) = hex_value(byte) {
                    self.state = State::AfterHashDigit(high);
                } else {
                    // A `#` not followed by two hex digits is malformed. Rather than guess
                    // whether the author meant a literal `#`, the name is marked
                    // unmatchable: over-reporting a name we misread would be worse than
                    // missing it.
                    self.malformed_escape(byte);
                }
            }
            State::AfterHashDigit(high) => {
                if let Some(low) = hex_value(byte) {
                    self.state = State::InName;
                    self.push((high << 4) | low);
                } else {
                    self.malformed_escape(byte);
                }
            }
        }
    }

    /// Abandons the current name, then reads `byte` as an ordinary one.
    ///
    /// Both halves of a `#xx` escape fail the same way, and the name has to stay
    /// unmatchable rather than be repaired into something it might not say.
    fn malformed_escape(&mut self, byte: u8) {
        self.unmatchable = true;
        self.in_name(byte);
    }

    /// One byte while inside a name, which may end it.
    fn in_name(&mut self, byte: u8) {
        if byte == b'#' {
            self.state = State::AfterHash;

            return;
        }

        if !is_delimiter(byte) {
            self.state = State::InName;
            self.push(byte);

            return;
        }

        self.close_name();

        // A `/` both ends the previous name and starts the next, so `/A/JS` finds `JS`.
        // Treating the delimiter as consumed would lose every name but the first in a run.
        if byte == b'/' {
            self.open_name();
        }
    }

    fn open_name(&mut self) {
        self.name.clear();
        self.unmatchable = false;
        self.state = State::InName;
    }

    fn close_name(&mut self) {
        if !self.unmatchable
            && let Some(risk) = risk_for(&self.name)
        {
            self.found.insert(risk);
        }

        self.name.clear();
        self.unmatchable = false;
        self.state = State::Outside;
    }

    fn push(&mut self, byte: u8) {
        if self.name.len() < LONGEST_NAME {
            self.name.push(byte);
        } else {
            self.unmatchable = true;
        }
    }
}

/// The indicator a name stands for, if it is one.
///
/// Exact matches only, and case-sensitively, because PDF names are case-sensitive: `/js`
/// is a different name from `/JS` and means nothing.
fn risk_for(name: &[u8]) -> Option<DocumentRisk> {
    match name {
        b"JavaScript" | b"JS" => Some(DocumentRisk::EmbeddedJavascript),
        b"Launch" => Some(DocumentRisk::LaunchesAProgram),
        b"OpenAction" | b"AA" => Some(DocumentRisk::ActionOnOpen),
        b"GoToR" | b"SubmitForm" | b"ImportData" => Some(DocumentRisk::RemoteData),
        b"EmbeddedFile" => Some(DocumentRisk::AttachedFile),
        b"XFA" => Some(DocumentRisk::XfaForm),
        b"RichMedia" | b"Movie" | b"Sound" | b"Screen" => Some(DocumentRisk::EmbeddedMedia),
        b"URI" => Some(DocumentRisk::ExternalLink),
        b"Encrypt" => Some(DocumentRisk::Encrypted),
        _ => None,
    }
}

/// Whether a byte ends a name, per the PDF specification's delimiter and whitespace sets.
const fn is_delimiter(byte: u8) -> bool {
    matches!(
        byte,
        // Whitespace: null, tab, line feed, form feed, carriage return, space.
        0x00 | 0x09 | 0x0a | 0x0c | 0x0d | 0x20
        // Delimiters.
        | b'(' | b')' | b'<' | b'>' | b'[' | b']' | b'{' | b'}' | b'/' | b'%'
    )
}

/// One hexadecimal digit's value, or `None` if it is not one.
const fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}
