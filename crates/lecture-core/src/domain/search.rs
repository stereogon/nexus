//! Finding words in what someone wrote: their notes, and the text their highlights carry.
//!
//! # Case, and what is not folded
//!
//! Matching ignores case — `raft` finds `Raft` — by lowercasing each character, which is
//! Unicode-aware (`É` finds `é`). It does not fold accents (`e` does not find `é`) or
//! ligatures; doing so honestly needs Unicode decomposition tables this crate does not
//! carry, and a search that half-folds is harder to predict than one that does not.
//!
//! # Why a snippet is three strings
//!
//! The window shows the matched words in bold. Offsets would have to agree on what they
//! count — Rust counts bytes or characters, JavaScript counts UTF-16 units — and an emoji in
//! someone's notes would put the bold in the wrong place. Three pieces need no counting.

use serde::Serialize;

/// Characters of context kept either side of a match.
pub const SNIPPET_CONTEXT: usize = 40;

/// A match in context: the words before it, the matched words as written, the words after.
/// `before` and `after` start and end with `…` where the text was cut.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    /// Up to [`SNIPPET_CONTEXT`] characters before the match.
    pub before: String,
    /// The matched text, in its original case.
    pub matched: String,
    /// Up to [`SNIPPET_CONTEXT`] characters after the match.
    pub after: String,
}

/// A line of notes containing the query, counting lines from 1.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineMatch {
    /// The line, counting from 1, as the editor counts them.
    pub line: usize,
    /// Where on the line, in context.
    pub snippet: Snippet,
}

/// What someone is searching for, ready to match.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchQuery {
    folded: Vec<char>,
}

impl SearchQuery {
    /// The query, or `None` if it has nothing in it but spaces.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        let folded: Vec<char> = text.trim().chars().flat_map(char::to_lowercase).collect();

        (!folded.is_empty()).then_some(Self { folded })
    }

    /// The first match in `text`, in context, or `None` if it does not occur.
    #[must_use]
    pub fn snippet(&self, text: &str) -> Option<Snippet> {
        let original: Vec<char> = text.chars().collect();
        // Each lowercased character, and which original character it came from: lowercasing
        // can turn one character into two, so positions in the two do not line up.
        let (folded, owner): (Vec<char>, Vec<usize>) = original
            .iter()
            .enumerate()
            .flat_map(|(at, character)| character.to_lowercase().map(move |lower| (lower, at)))
            .unzip();

        let found = folded
            .windows(self.folded.len())
            .position(|window| window == self.folded.as_slice())?;
        let start = *owner.get(found)?;
        let end = owner.get(found + self.folded.len() - 1)? + 1;

        Some(Snippet {
            before: context_before(&original, start),
            matched: original.get(start..end)?.iter().collect(),
            after: context_after(&original, end),
        })
    }

    /// The lines of `text` containing the query, at most `limit` of them, and how many
    /// lines matched in all.
    #[must_use]
    pub fn lines(&self, text: &str, limit: usize) -> (Vec<LineMatch>, usize) {
        let mut found = Vec::new();
        let mut total = 0;

        for (index, line) in text.lines().enumerate() {
            if let Some(snippet) = self.snippet(line) {
                total += 1;

                if found.len() < limit {
                    found.push(LineMatch {
                        line: index + 1,
                        snippet,
                    });
                }
            }
        }

        (found, total)
    }
}

fn context_before(original: &[char], start: usize) -> String {
    let from = start.saturating_sub(SNIPPET_CONTEXT);
    let kept: String = original
        .get(from..start)
        .unwrap_or_default()
        .iter()
        .collect();
    let kept = kept.trim_start();

    if from > 0 {
        format!("…{kept}")
    } else {
        kept.to_owned()
    }
}

fn context_after(original: &[char], end: usize) -> String {
    let to = (end + SNIPPET_CONTEXT).min(original.len());
    let kept: String = original.get(end..to).unwrap_or_default().iter().collect();
    let kept = kept.trim_end();

    if to < original.len() {
        format!("{kept}…")
    } else {
        kept.to_owned()
    }
}
