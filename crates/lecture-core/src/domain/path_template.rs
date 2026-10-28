//! Where a lecture's folder goes, written as a pattern over its facets.
//!
//! `CLAUDE.md` §3 says taxonomy lives in each bundle's manifest as facets, and that the
//! sidebar groups on them at runtime so one physical layout serves many logical views. The
//! physical layout still has to be *something*, though, and typing it out for every import
//! is the kind of chore that ends with a vault organised four different ways.
//!
//! A template answers it once: `{course}/{week}-{title}` files everything the same way.
//!
//! # Deliberately not a language
//!
//! Literals and `{placeholder}`s, and that is all — no conditionals, no defaults, no
//! formatting. §1.11 says not to reach for a pattern larger than the problem, and the
//! problem is one person filing their own lectures. Two rules cover what a language would
//! otherwise be needed for:
//!
//! - **A segment with any missing placeholder is left out entirely.** So
//!   `{course}/{module}/{title}` files a lecture with no module at `{course}/{title}`,
//!   rather than inventing an `unfiled` folder or producing a stray `-` where the value
//!   should have been.
//! - **The last segment must contain `{title}`**, which is checked when the template is
//!   parsed. A `Manifest` always has a title, so the last segment always renders — and
//!   every lecture therefore gets a folder of its own instead of becoming its course.
//!
//! # `{tags}` is refused
//!
//! Tags are a list, and a path segment is one name. Silently taking the first tag, or
//! joining them, would both be surprising. Refusing at parse time says so while someone is
//! still looking at the template.

use crate::domain::{Facets, Label, MAX_BUNDLE_DEPTH, RelativePath, Slug};
use crate::error::CoreError;

/// A value a placeholder can stand for.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Field {
    Course,
    Module,
    Week,
    Title,
    /// One of the open `custom` facets, by key.
    Custom(String),
}

impl Field {
    /// Reads a placeholder name.
    fn parse(name: &str, template: &str) -> Result<Self, CoreError> {
        let refuse = |reason| {
            Err(CoreError::InvalidPathTemplate {
                template: template.to_owned(),
                reason,
            })
        };

        match name {
            "" => refuse("it has an empty {} placeholder"),
            "course" => Ok(Self::Course),
            "module" => Ok(Self::Module),
            "week" => Ok(Self::Week),
            "title" => Ok(Self::Title),
            "tags" => refuse("{tags} cannot be a folder name, because a lecture may have several"),
            custom => Ok(Self::Custom(custom.to_owned())),
        }
    }

    /// The value for this field, or `None` if the lecture does not have one.
    fn resolve<'a>(&'a self, facets: &'a Facets, title: &'a Label) -> Option<&'a Label> {
        match self {
            Self::Course => facets.course(),
            Self::Module => facets.module(),
            Self::Week => facets.week(),
            Self::Title => Some(title),
            Self::Custom(key) => facets.custom().get(key),
        }
    }
}

/// One piece of a folder name.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Part {
    Literal(String),
    Field(Field),
}

/// One folder level.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Segment {
    parts: Vec<Part>,
}

impl Segment {
    /// Renders this level, or `None` if any placeholder in it has no value.
    fn render(&self, facets: &Facets, title: &Label) -> Option<String> {
        let mut out = String::new();

        for part in &self.parts {
            match part {
                Part::Literal(text) => out.push_str(text),
                Part::Field(field) => out.push_str(field.resolve(facets, title)?.as_str()),
            }
        }

        Some(out)
    }

    /// Whether this level names the lecture itself.
    fn holds_the_title(&self) -> bool {
        self.parts
            .iter()
            .any(|part| matches!(part, Part::Field(Field::Title)))
    }
}

/// A pattern for where a lecture's folder goes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathTemplate {
    segments: Vec<Segment>,
}

/// Why a pattern cannot name a folder for a lecture.
///
/// Not a [`CoreError`], because nothing has failed: this is a finding about one lecture in
/// a preview someone is reading, and the rest of the plan is still good. Two variants
/// rather than one because they have different answers, and the answer is the whole point
/// of telling someone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unnameable {
    /// Every level dropped, because the facets this pattern names are missing. The common
    /// case: a freshly imported lecture under `{course}/{week}-{title}`.
    FacetsMissing,
    /// A level rendered text that no folder name can hold — only punctuation or symbols.
    TextUnusable,
}

impl PathTemplate {
    /// Reads a template such as `{course}/{week}-{title}`.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidPathTemplate`] if the template is empty, has unbalanced
    /// braces, uses `{tags}`, nests more than [`MAX_BUNDLE_DEPTH`] levels, or does not end
    /// with a segment containing `{title}`. Every one of these is worth refusing while
    /// someone is still looking at the template rather than discovering it a hundred
    /// lectures later.
    pub fn parse(raw: &str) -> Result<Self, CoreError> {
        let refuse = |reason| {
            Err(CoreError::InvalidPathTemplate {
                template: raw.to_owned(),
                reason,
            })
        };

        if raw.trim().is_empty() {
            return refuse("it is empty, so it does not say where anything goes");
        }

        let mut segments = Vec::new();

        for level in raw.split('/') {
            if level.is_empty() {
                return refuse("it has an empty folder level, from a `/` with nothing beside it");
            }

            segments.push(parse_segment(level, raw)?);
        }

        if segments.len() > MAX_BUNDLE_DEPTH {
            return refuse("it nests deeper than five folders, which is the limit");
        }

        match segments.last() {
            Some(last) if last.holds_the_title() => Ok(Self { segments }),
            _ => refuse("its last folder must include {title}, so each lecture gets its own"),
        }
    }

    /// Where a lecture with these facets and this title belongs, or why this pattern
    /// cannot say.
    ///
    /// Each level is slugified with [`Slug::from_title`], so a title may contain spaces and
    /// punctuation while the folder name stays safe and lowercase.
    ///
    /// # Errors
    ///
    /// Returns [`Unnameable`], which keeps the two causes apart. This used to return a
    /// `CoreError` for both, and a planner cannot tell them apart from that — they arrive
    /// as the same invalid-path error — so a lecture missing a week was told its *title*
    /// was unusable. See the decision log for 2026-10-28.
    pub fn place(&self, facets: &Facets, title: &Label) -> Result<RelativePath, Unnameable> {
        let mut levels = Vec::new();

        for segment in &self.segments {
            // A level with a missing placeholder is left out, not guessed at.
            if let Some(rendered) = segment.render(facets, title) {
                levels.push(Slug::from_title(&rendered).map_err(|_| Unnameable::TextUnusable)?);
            }
        }

        // The only way `from_segments` fails here is by being handed nothing: `parse` caps
        // a template at five levels, which is under `MAX_DEPTH`. Nothing means every level
        // named a facet this lecture does not have.
        RelativePath::from_segments(levels).map_err(|_| Unnameable::FacetsMissing)
    }

    /// How many folder levels this template describes at most.
    #[must_use]
    pub fn depth(&self) -> usize {
        self.segments.len()
    }
}

/// Splits one folder level into literals and placeholders.
fn parse_segment(level: &str, template: &str) -> Result<Segment, CoreError> {
    let refuse = |reason| {
        Err(CoreError::InvalidPathTemplate {
            template: template.to_owned(),
            reason,
        })
    };

    let mut parts = Vec::new();
    let mut literal = String::new();
    let mut rest = level;

    loop {
        let Some((before, tail)) = rest.split_once('{') else {
            literal.push_str(rest);
            break;
        };

        literal.push_str(before);

        let Some((name, tail)) = tail.split_once('}') else {
            return refuse("it has a `{` with no closing `}`");
        };

        if name.contains('{') {
            return refuse("it has a `{` inside a placeholder");
        }

        if !literal.is_empty() {
            parts.push(Part::Literal(std::mem::take(&mut literal)));
        }

        parts.push(Part::Field(Field::parse(name, template)?));
        rest = tail;
    }

    if literal.contains('}') {
        return refuse("it has a `}` with no opening `{`");
    }

    if !literal.is_empty() {
        parts.push(Part::Literal(literal));
    }

    Ok(Segment { parts })
}
