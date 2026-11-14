//! A page: a note that lives inside another note (2026-11-14).
//!
//! A page belongs to one item and is stored inside its bundle, at `pages/<id>.md`, as
//! pasted images are kept in `assets/`. It has no row of its own in the sidebar and no
//! manifest: the vault walk never sees it, so moving or renaming the item takes its pages
//! along and nothing about how lectures are found changes (`CLAUDE.md` §3).
//!
//! Its file, front matter and body, is read and written by `page_file`.

use std::collections::BTreeSet;
use std::fmt;

use serde::Serialize;

use crate::domain::AnnotationId;
use crate::error::CoreError;

/// The folder inside a bundle that holds its pages.
pub const PAGES_DIR_NAME: &str = "pages";

/// The scheme a link to a page is written under: `[Title](page://<id>)`.
pub const PAGE_SCHEME: &str = "page://";

/// The version of the front matter this build writes.
pub const PAGE_FORMAT_VERSION: u32 = 1;

/// The longest title kept, in characters.
pub const MAX_PAGE_TITLE_CHARS: usize = 200;

/// A page's name in links and on disk.
///
/// The alphabet of [`AnnotationId`], for the same reason: it needs no escaping in a URL or
/// a filename, so `page://<id>` and `pages/<id>.md` mean one thing however they are read.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(into = "String")]
pub struct PageId(AnnotationId);

impl PageId {
    /// Validates an id.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidName`] under the rules of [`AnnotationId::parse`].
    pub fn parse(raw: &str) -> Result<Self, CoreError> {
        AnnotationId::parse(raw).map(Self)
    }

    /// The id as written.
    #[must_use]
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }

    /// `<id>.md`, its file in the `pages` folder.
    #[must_use]
    pub fn file_name(&self) -> String {
        format!("{}.md", self.as_str())
    }

    /// The id a file in the `pages` folder is named for, or `None` if it is not a page.
    #[must_use]
    pub fn of_file_name(name: &str) -> Option<Self> {
        Self::parse(name.strip_suffix(".md")?).ok()
    }
}

impl From<PageId> for String {
    fn from(id: PageId) -> Self {
        id.0.into()
    }
}

impl fmt::Display for PageId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A page's title, held to one line of reasonable length.
///
/// # Errors
///
/// Returns [`CoreError::InvalidName`] if the title is blank once trimmed, holds a line
/// break or another control character, or is longer than [`MAX_PAGE_TITLE_CHARS`].
pub fn page_title(raw: &str) -> Result<String, CoreError> {
    let title = raw.trim();
    let reject = |reason: &'static str| {
        Err(CoreError::InvalidName {
            name: title.to_owned(),
            reason,
        })
    };

    if title.is_empty() {
        return reject("a page needs a name");
    }

    if title.chars().any(char::is_control) {
        return reject("a page's name is one line of text");
    }

    if title.chars().count() > MAX_PAGE_TITLE_CHARS {
        return reject("a page's name is at most 200 characters");
    }

    Ok(title.to_owned())
}

/// The line a page's link is written as, `[Title](page://<id>)`, with what would end the
/// link text early escaped.
#[must_use]
pub fn page_link(id: &PageId, title: &str) -> String {
    let label: String = title
        .chars()
        .flat_map(|character| {
            let escape = matches!(character, '\\' | '[' | ']');

            escape.then_some('\\').into_iter().chain([character])
        })
        .collect();

    format!("[{label}]({PAGE_SCHEME}{id})")
}

/// `root` and every page inside it at any depth, `root` first, from each page's parent.
///
/// The app never makes a cycle, since a page is given its parent once and never moved; a
/// hand-edited `parent` could, so each page is visited once and the walk always ends.
#[must_use]
pub fn page_and_descendants(parents: &[(PageId, Option<PageId>)], root: &PageId) -> Vec<PageId> {
    let mut found = vec![root.clone()];
    let mut seen = BTreeSet::from([root.clone()]);
    let mut next = 0;

    while let Some(current) = found.get(next).cloned() {
        next += 1;

        for (id, parent) in parents {
            if parent.as_ref() == Some(&current) && seen.insert(id.clone()) {
                found.push(id.clone());
            }
        }
    }

    found
}
