//! Finding the lectures in a vault.
//!
//! # The rule, and what follows from it
//!
//! **A lecture is any directory containing `manifest.json`.** Not a registry entry, not
//! a row in an index — `CLAUDE.md` §3 locks this, and a central index is explicitly
//! rejected as a sync-conflict magnet. The consequence is that reorganising a vault in
//! Finder with the app closed is a supported operation, because there is nothing to keep
//! in step.
//!
//! The walk therefore **prunes at the first manifest it finds**. Everything below a
//! lecture is that lecture's own content — `source/`, `assets/` — and must not be
//! mistaken for more lectures.
//!
//! # Nothing is silently omitted
//!
//! A folder the walk cannot use is *reported*, never quietly skipped. If a lecture
//! vanished from the sidebar with no explanation, the natural conclusion would be that
//! the app lost it. So a name that cannot be a [`Slug`], a folder nested past the cap, a
//! directory that cannot be read, and a lecture buried inside another lecture all come
//! back as [`SkippedDirectory`] with a reason to show.
//!
//! Hidden directories are the one exception: a leading dot means `.nexus`, `.git` or
//! `.DS_Store`, which are expected and not interesting.

use crate::domain::{MANIFEST_FILE_NAME, MAX_BUNDLE_DEPTH, RelativePath, Slug};
use crate::error::CoreError;
use crate::ports::VaultDirectory;

/// Why a directory could not be treated as, or searched for, a lecture.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkipReason {
    /// The folder name cannot be used safely on every filesystem a vault may sync to.
    UnusableName,
    /// It sits deeper than the vault's nesting cap allows.
    TooDeeplyNested,
    /// It could not be read — permissions, or a sync client holding it.
    Unreadable,
    /// It is a lecture inside another lecture, so it cannot be addressed as its own.
    LectureInsideLecture,
}

impl SkipReason {
    /// A sentence to show a person, saying what to do about it.
    #[must_use]
    pub const fn remediation(self) -> &'static str {
        match self {
            Self::UnusableName => {
                "This folder's name cannot be used on every device a vault syncs to, so \
                 the lecture inside it was left out. Renaming the folder will make it \
                 appear. Nothing was changed."
            }
            Self::TooDeeplyNested => {
                "This folder is nested too deeply for Nexus to reach. Moving it closer \
                 to the top of the vault will make the lecture inside it appear. Nothing \
                 was changed."
            }
            Self::Unreadable => {
                "This folder could not be read, so anything inside it was left out. It \
                 may be mid-sync, or its permissions may have changed. Nothing was \
                 changed, and trying again later usually works."
            }
            Self::LectureInsideLecture => {
                "There is a lecture inside another lecture. Only the outer one is shown, \
                 because the inner one cannot be addressed separately. Moving the inner \
                 folder out of the outer one will make both appear. Nothing was changed."
            }
        }
    }
}

/// A directory the walk could not use, and why.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkippedDirectory {
    /// Where it is, as a path to show. Not a [`RelativePath`], because the reason it was
    /// skipped may be that its name cannot *be* one.
    pub shown_path: String,
    /// Why it was skipped.
    pub reason: SkipReason,
}

/// What a walk of the vault found.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct VaultScan {
    lectures: Vec<RelativePath>,
    skipped: Vec<SkippedDirectory>,
}

impl VaultScan {
    /// Every lecture directory found, in path order.
    #[must_use]
    pub fn lectures(&self) -> &[RelativePath] {
        &self.lectures
    }

    /// How many lectures were found.
    #[must_use]
    pub fn len(&self) -> usize {
        self.lectures.len()
    }

    /// Whether the vault holds no lectures.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.lectures.is_empty()
    }

    /// Directories that could not be used, each with a reason to show.
    ///
    /// An empty list is the normal case. A non-empty one is worth surfacing, because
    /// every entry means a lecture a person expected to see is not there.
    #[must_use]
    pub fn skipped(&self) -> &[SkippedDirectory] {
        &self.skipped
    }
}

/// Walks `directory` and returns the lectures in it.
///
/// Depth-first with an explicit stack rather than recursion, so the bound is visible
/// rather than resting on the depth cap holding.
///
/// # Errors
///
/// Returns [`CoreError::Io`] only if the vault *root* cannot be read, since that means
/// there is no vault to scan. A failure deeper down is recorded against that directory
/// and the walk carries on — one unreadable folder must not make a whole vault
/// unopenable.
pub fn scan_vault(directory: &impl VaultDirectory) -> Result<VaultScan, CoreError> {
    let mut scan = VaultScan::default();
    let root = directory.list(None)?;
    let mut pending = vec![(None, root)];

    while let Some((at, entries)) = pending.pop() {
        for entry in entries {
            if !entry.is_directory() {
                continue;
            }
            // `.nexus`, `.git`, `.DS_Store`: expected, and not worth reporting.
            if entry.name.starts_with('.') {
                continue;
            }

            let Ok(name) = Slug::parse(&entry.name) else {
                scan.skipped.push(SkippedDirectory {
                    shown_path: show(at.as_ref(), &entry.name),
                    reason: SkipReason::UnusableName,
                });
                continue;
            };

            let path = match at.as_ref() {
                Some(parent) => parent.child(name)?,
                None => RelativePath::root_level(name),
            };

            let Ok(children) = directory.list(Some(&path)) else {
                scan.skipped.push(SkippedDirectory {
                    shown_path: path.to_string(),
                    reason: SkipReason::Unreadable,
                });
                continue;
            };

            if holds_manifest(&children) {
                scan.lectures.push(path.clone());
                // Pruned: everything below belongs to this lecture. One bounded sweep
                // still happens, so a lecture buried inside it is reported rather than
                // disappearing without explanation.
                report_nested(directory, &path, children, &mut scan);
                continue;
            }

            if path.depth() >= MAX_BUNDLE_DEPTH {
                // Only worth reporting if something is actually down there to lose.
                if children
                    .iter()
                    .any(|child| child.is_directory() && !child.name.starts_with('.'))
                {
                    scan.skipped.push(SkippedDirectory {
                        shown_path: path.to_string(),
                        reason: SkipReason::TooDeeplyNested,
                    });
                }
                continue;
            }

            pending.push((Some(path), children));
        }
    }

    scan.lectures.sort();
    scan.skipped.sort_by(|a, b| a.shown_path.cmp(&b.shown_path));

    Ok(scan)
}

/// Whether a listing contains `manifest.json` as a file.
fn holds_manifest(entries: &[crate::ports::DirectoryEntry]) -> bool {
    entries
        .iter()
        .any(|entry| !entry.is_directory() && entry.name == MANIFEST_FILE_NAME)
}

/// Reports any lecture buried inside the lecture at `path`.
///
/// Bounded by the vault's nesting cap, so a bundle with a deep assets tree costs a
/// bounded sweep rather than an open-ended one. Read failures inside a bundle are
/// ignored: the lecture itself was found, and warning about its asset folder would be
/// noise.
fn report_nested(
    directory: &impl VaultDirectory,
    path: &RelativePath,
    entries: Vec<crate::ports::DirectoryEntry>,
    scan: &mut VaultScan,
) {
    let mut pending = vec![(path.clone(), entries)];

    while let Some((at, listing)) = pending.pop() {
        for entry in listing {
            if !entry.is_directory() || entry.name.starts_with('.') {
                continue;
            }
            let Ok(name) = Slug::parse(&entry.name) else {
                continue;
            };
            let Ok(inner) = at.child(name) else {
                continue;
            };
            let Ok(children) = directory.list(Some(&inner)) else {
                continue;
            };

            if holds_manifest(&children) {
                scan.skipped.push(SkippedDirectory {
                    shown_path: inner.to_string(),
                    reason: SkipReason::LectureInsideLecture,
                });
                // Not descended into: one report per buried lecture is enough, and
                // whatever is under it is that lecture's own content.
                continue;
            }

            if inner.depth() < MAX_BUNDLE_DEPTH {
                pending.push((inner, children));
            }
        }
    }
}

/// A path to show for a name that may not be a valid segment.
fn show(parent: Option<&RelativePath>, name: &str) -> String {
    match parent {
        Some(parent) => format!("{parent}/{name}"),
        None => name.to_owned(),
    }
}
