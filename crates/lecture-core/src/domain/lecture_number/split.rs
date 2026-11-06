//! Taking a lecture's number out of the name its file arrived with.
//!
//! Recognised, ignoring case:
//!
//! - a number at the start, followed by a separator: `2. Process`, `02 - Raft`, `03_Paxos`,
//!   `4) Logs` — up to three digits, so `2024 Exam Review` keeps its year;
//! - `Lecture`, `Lec` or `L` and a number, anywhere: `Lecture 3 Raft`, `L03_Raft`,
//!   `Week 4 Lecture 2 - Logs`, `CS454 Lec 7`.
//!
//! The number loses its leading zeros (`03` is `3`) and keeps a lowercase letter after it
//! (`3a`); an uppercase one is part of a word (`3D printing` has no lecture number).
//! What is left, tidied of the separators the number stood between, is the title; if
//! nothing is left, the whole name stays the title — `03.pdf` is better called `03` than
//! nothing.

use super::LectureNumber;

/// Separators between a number and the rest of a name.
const SEPARATORS: &[char] = &[
    ' ', '.', '_', '-', ':', ')', '\u{2013}', '\u{2014}', '\u{00B7}', '\u{2022}',
];

/// A name with its number taken out.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SplitTitle {
    /// The number found, if there was one.
    pub number: Option<LectureNumber>,
    /// The rest of the name, or the whole of it.
    pub title: String,
}

/// The digits and optional letter at the start of `text`, if `max_digits` or fewer, and
/// the byte length they take.
fn number_at(text: &str, max_digits: usize) -> Option<(String, usize)> {
    let digits: String = text.chars().take_while(char::is_ascii_digit).collect();

    if digits.is_empty() || digits.len() > max_digits {
        return None;
    }

    // Digits are ASCII, so every offset counted here falls on a character boundary; `get`
    // is used all the same, so a mistake here returns `None` rather than panicking.
    let after = text.get(digits.len()..)?;
    let mut letters = after.chars();
    let letter = letters
        .next()
        // Lowercase only: `5a` is a lecture after 5, `3D printing` is a subject.
        .filter(|c| c.is_ascii_lowercase() && !letters.next().is_some_and(char::is_alphanumeric));
    let significant = digits.trim_start_matches('0');
    let mut number = if significant.is_empty() {
        "0"
    } else {
        significant
    }
    .to_owned();
    let mut used = digits.len();

    if let Some(letter) = letter {
        number.push(letter.to_ascii_lowercase());
        used += 1;
    }

    // A number has to end at a separator or the end, or `3D printing` would be number `3d`.
    let ends = text
        .get(used..)?
        .chars()
        .next()
        .is_none_or(|next| SEPARATORS.contains(&next));

    ends.then_some((number, used))
}

/// `name` with the number at byte `start..end` removed and the separators around it tidied.
fn without(name: &str, start: usize, end: usize) -> Option<String> {
    let before = name.get(..start)?.trim_end_matches(SEPARATORS);
    let after = name.get(end..)?.trim_start_matches(SEPARATORS);

    Some(match (before.is_empty(), after.is_empty()) {
        (true, _) => after.to_owned(),
        (false, true) => before.to_owned(),
        (false, false) => format!("{before} – {after}"),
    })
}

/// The lecture word and number anywhere in `name`: its byte span and the number.
fn lecture_word(name: &str) -> Option<(usize, usize, String)> {
    let lower = name.to_ascii_lowercase();

    // `to_ascii_lowercase` changes only ASCII letters, byte for byte, so offsets in `lower`
    // are offsets in `name`.
    for (start, _) in lower.char_indices() {
        let before = lower.get(..start)?;

        if before.ends_with(|c: char| c.is_alphanumeric()) {
            continue;
        }

        for word in ["lecture", "lect", "lec", "l"] {
            let Some(rest) = lower.get(start..).and_then(|tail| tail.strip_prefix(word)) else {
                continue;
            };
            let gap = rest.len() - rest.trim_start_matches([' ', '_', '-', '.']).len();

            // `L` must touch its number (`L03`); the words may have a gap (`Lecture 3`).
            if word == "l" && gap > 0 {
                continue;
            }

            let from = start + word.len() + gap;

            if let Some((number, used)) = name.get(from..).and_then(|tail| number_at(tail, 3)) {
                return Some((start, from + used, number));
            }
        }
    }

    None
}

/// Takes the number out of a file's name, if it has one.
#[must_use]
pub fn split_number(name: &str) -> SplitTitle {
    let name = name.trim();

    let found =
        lecture_word(name).or_else(|| number_at(name, 3).map(|(number, used)| (0, used, number)));

    let Some((start, end, number)) = found else {
        return SplitTitle {
            number: None,
            title: name.to_owned(),
        };
    };

    let rest = without(name, start, end).unwrap_or_default();

    SplitTitle {
        number: LectureNumber::parse(&number),
        title: if rest.is_empty() {
            name.to_owned()
        } else {
            rest
        },
    }
}
