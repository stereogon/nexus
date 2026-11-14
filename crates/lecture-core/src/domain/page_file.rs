//! A page's file (2026-11-14), split from `page` when that passed 300 lines.
//!
//! # Markdown with front matter
//!
//! The front-matter pattern Jekyll and Obsidian read: a `---` fence at the top holding the
//! page's title, its parent and when it was made, then the body, which is exactly what was
//! typed. One file per page, so each page is self-describing on any device and an edit
//! touches one file, which is what keeps sync conflicts small.
//!
//! ```text
//! ---
//! nexus-page: 1
//! title: "Leader election ideas"
//! parent: "18f2a…"            (left out for a page directly in the item's notes)
//! created: "2026-11-14T09:30:00Z"
//! ---
//!
//! The body.
//! ```
//!
//! Values are written double-quoted, with `\\` and `"` escaped: a string JSON and YAML both
//! read the same way, so a title with a colon or a quote in it round-trips without a YAML
//! parser. Nothing else needs escaping, because a title holds no control characters. Keys
//! this build does not know are ignored on reading, and the header is kept byte for byte
//! when the body is saved, so a newer build's fields survive an older one.

use crate::domain::{PAGE_FORMAT_VERSION, PageId, Timestamp, page_title};

const FENCE: &str = "---";
const VERSION_KEY: &str = "nexus-page";

/// What a page's front matter says about it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageHeader {
    /// Its name.
    pub title: String,
    /// The page it is inside, or `None` for one directly in the item's notes.
    pub parent: Option<PageId>,
    /// When it was made.
    pub created: Timestamp,
}

impl PageHeader {
    /// The front matter for this header, ending with the closing fence and a blank line.
    #[must_use]
    pub fn write(&self) -> String {
        let mut lines = vec![
            FENCE.to_owned(),
            format!("{VERSION_KEY}: {PAGE_FORMAT_VERSION}"),
            format!("title: {}", quoted(&self.title)),
        ];

        if let Some(parent) = &self.parent {
            lines.push(format!("parent: {}", quoted(parent.as_str())));
        }

        lines.push(format!("created: {}", quoted(self.created.as_str())));
        lines.push(FENCE.to_owned());

        format!("{}\n\n", lines.join("\n"))
    }
}

/// How pages are named in a message, the file being one of many.
pub const PAGE_FILE_PATTERN: &str = "pages/<id>.md";

/// Why a file in the `pages` folder could not be read as a page.
///
/// Two cases a reader must treat oppositely, as `versioned.rs` in `lecture-fs` explains for
/// the JSON files: a damaged file is copied aside, and one from a newer build is left alone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageUnreadable {
    /// Written by a build with a newer front matter; not damaged.
    Newer {
        /// The version it claims.
        found: u32,
    },
    /// Not a page as this build writes them, and why.
    Damaged(&'static str),
}

/// A page file split into its header and its body.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageFile<'a> {
    /// What the front matter says.
    pub header: PageHeader,
    /// The front matter exactly as stored, so a save of the body keeps it byte for byte.
    pub front: &'a str,
    /// The Markdown after it, exactly as stored.
    pub body: &'a str,
}

impl<'a> PageFile<'a> {
    /// Splits a page file.
    ///
    /// # Errors
    ///
    /// Returns [`PageUnreadable::Newer`] for a version this build does not read, and
    /// [`PageUnreadable::Damaged`] for no front matter, a value that is not a string, or a
    /// missing or invalid title or date.
    pub fn parse(text: &'a str) -> Result<Self, PageUnreadable> {
        let (lines, body) = split(text).map_err(PageUnreadable::Damaged)?;
        let header = read_header(lines)?;
        let front = text.get(..text.len() - body.len()).unwrap_or_default();

        Ok(Self {
            header,
            front,
            body,
        })
    }
}

/// The front matter's lines, and the body after it.
fn split(text: &str) -> Result<(&str, &str), &'static str> {
    let rest = text
        .strip_prefix("---\n")
        .ok_or("it does not start with a --- line")?;
    let (end, body_at) = rest
        .find("\n---\n")
        .map(|at| (at, at + 5))
        .or_else(|| {
            rest.strip_suffix("\n---")
                .map(|lines| (lines.len(), rest.len()))
        })
        .ok_or("its front matter has no closing --- line")?;
    let lines = rest.get(..end).ok_or("its front matter is cut short")?;
    let after = rest.get(body_at..).unwrap_or_default();

    // The blank line the header is written with belongs to the header.
    Ok((lines, after.strip_prefix('\n').unwrap_or(after)))
}

fn read_header(lines: &str) -> Result<PageHeader, PageUnreadable> {
    use PageUnreadable::Damaged;

    let mut title = None;
    let mut parent = None;
    let mut created = None;

    for line in lines.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim();
        let text = || {
            unquoted(value).ok_or(Damaged(
                "a value in its front matter is not a quoted string",
            ))
        };

        match key.trim() {
            VERSION_KEY => {
                let found: u32 = value
                    .parse()
                    .map_err(|_| Damaged("its nexus-page version is not a number"))?;

                if found > PAGE_FORMAT_VERSION {
                    return Err(PageUnreadable::Newer { found });
                }
            }
            "title" => {
                title = Some(
                    page_title(&text()?).map_err(|_| Damaged("its title is blank or too long"))?,
                );
            }
            "parent" => {
                parent = Some(
                    PageId::parse(&text()?).map_err(|_| Damaged("its parent is not a page id"))?,
                );
            }
            "created" => {
                created = Some(
                    Timestamp::parse(&text()?)
                        .map_err(|_| Damaged("its created date is not a date"))?,
                );
            }
            _ => {}
        }
    }

    Ok(PageHeader {
        title: title.ok_or(Damaged("it has no title"))?,
        parent,
        created: created.ok_or(Damaged("it has no created date"))?,
    })
}

/// `value` double-quoted, with `\\` and `"` escaped.
fn quoted(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

/// The text inside a value [`quoted`] wrote, or `None` if it is not one.
fn unquoted(value: &str) -> Option<String> {
    let inner = value.strip_prefix('"')?.strip_suffix('"')?;
    let mut text = String::with_capacity(inner.len());
    let mut characters = inner.chars();

    while let Some(character) = characters.next() {
        match character {
            '\\' => match characters.next()? {
                escaped @ ('\\' | '"') => text.push(escaped),
                _ => return None,
            },
            '"' => return None,
            _ => text.push(character),
        }
    }

    Some(text)
}
