//! Listing the contents of a directory.
//!
//! The vault *walk* is domain logic — which directories are lectures, how deep nesting
//! may go, what to do about a folder whose name cannot be used — and none of it depends
//! on how directories are read. So the rules live in
//! [`crate::domain::scan_vault`] and only the reading is a port.
//!
//! Two things follow. The iPadOS app in Phase 2 implements this one trait and inherits
//! the walk rather than reimplementing them, and the walk's tests describe a tree in
//! memory instead of creating thousands of real directories.

use crate::domain::RelativePath;
use crate::error::CoreError;

/// Whether an entry can be descended into.
///
/// Symlinks are deliberately absent: an adapter reports what a symlink *points at*, or
/// refuses it. The walk has no business knowing, and giving it a third case would mean
/// every caller deciding what to do about one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryKind {
    /// A directory, which the walk may descend into.
    Directory,
    /// Anything else. Only the name matters, to spot `manifest.json`.
    File,
}

/// One entry in a directory listing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DirectoryEntry {
    /// The name exactly as the filesystem gives it.
    ///
    /// A `String` rather than a [`crate::domain::Slug`] on purpose: the walk must be
    /// able to *see* a name it cannot use — a leading dot, a trailing space, something
    /// too long — in order to report it instead of silently omitting the lecture inside
    /// it. Validating here would throw away the thing worth telling someone about.
    pub name: String,
    /// Whether it can be descended into.
    pub kind: EntryKind,
}

impl DirectoryEntry {
    /// A directory entry.
    #[must_use]
    pub fn directory(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            kind: EntryKind::Directory,
        }
    }

    /// A file entry.
    #[must_use]
    pub fn file(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            kind: EntryKind::File,
        }
    }

    /// Whether this is a directory.
    #[must_use]
    pub fn is_directory(&self) -> bool {
        self.kind == EntryKind::Directory
    }
}

/// Reads directory listings from somewhere a vault lives.
pub trait VaultDirectory {
    /// Lists one directory's entries.
    ///
    /// `at` is `None` for the vault root, because [`RelativePath`] cannot be empty —
    /// non-emptiness is the property that makes it unable to escape a root, and a
    /// special "empty path" value to represent the root would give that away.
    ///
    /// Order is not guaranteed; the walk sorts what it produces.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] if the directory cannot be read. The walk records that
    /// against the directory and carries on, so one unreadable folder does not make a
    /// whole vault unopenable.
    fn list(&self, at: Option<&RelativePath>) -> Result<Vec<DirectoryEntry>, CoreError>;
}
