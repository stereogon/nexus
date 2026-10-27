//! Proving, against the real filesystem, that a path stays inside the vault.
//!
//! [`VaultRelativePath`] already guarantees *lexical* containment: it cannot contain
//! `..`, so joining it onto a root produces a path that textually sits underneath. That
//! is not enough on a real disk. If `lectures` is a symbolic link to `/etc`, then
//! `lectures/passwd` is lexically inside the vault and physically is not.
//!
//! This module closes that gap, and hands back a [`ResolvedPath`] as the evidence.
//! Functions that write to disk take a `ResolvedPath` rather than a `Path`, so an
//! unchecked location cannot reach them — the check cannot be forgotten, because the
//! type system will not assemble the call without it.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use lecture_core::{CoreError, VaultRelativePath};

use crate::error::{io_error, render};

/// An opened vault root, stored canonicalised.
///
/// Canonicalising the root means a **symlinked root is allowed**: someone who keeps
/// their vault on an external drive and links to it from their home folder is making a
/// deliberate choice about where their own files live, and resolution simply happens
/// against the real location. Symlinks *inside* the vault are a different matter and are
/// refused — see [`VaultRoot::resolve`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultRoot {
    canonical: PathBuf,
}

/// A path that has been proven to resolve inside a [`VaultRoot`].
///
/// There is no public constructor. The only way to obtain one is
/// [`VaultRoot::resolve`], which is what makes it usable as evidence rather than as a
/// comment claiming the check happened.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedPath {
    absolute: PathBuf,
}

impl ResolvedPath {
    /// The absolute location on disk.
    #[must_use]
    pub fn as_path(&self) -> &Path {
        &self.absolute
    }

    /// A sibling of this path, named this one's name plus `suffix`.
    ///
    /// Containment carries over without re-checking the filesystem, and that is sound
    /// rather than convenient: the result keeps the same parent directory, and a suffix
    /// containing no separator cannot move the name out of it. Used for `.bak`, and for
    /// anything else that must land strictly beside an already-proven path.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidVaultPath`] if `suffix` contains a separator, or if
    /// this path somehow names no file.
    pub(crate) fn with_name_suffix(&self, suffix: &str) -> Result<Self, CoreError> {
        if suffix.contains('/') || suffix.contains('\\') {
            return Err(CoreError::InvalidVaultPath {
                path: render(&self.absolute),
                reason: "a sibling suffix cannot contain a path separator",
            });
        }

        let parent = self
            .absolute
            .parent()
            .ok_or_else(|| CoreError::InvalidVaultPath {
                path: render(&self.absolute),
                reason: "has no containing folder for a sibling",
            })?;

        let file_name = self
            .absolute
            .file_name()
            .ok_or_else(|| CoreError::InvalidVaultPath {
                path: render(&self.absolute),
                reason: "does not name a file",
            })?;

        let mut derived = file_name.to_os_string();
        derived.push(suffix);

        Ok(Self {
            absolute: parent.join(derived),
        })
    }
}

impl VaultRoot {
    /// Opens `path` as a vault root.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] if the folder cannot be read, or
    /// [`CoreError::VaultRootUnusable`] if it is not a folder.
    pub fn open(path: &Path) -> Result<Self, CoreError> {
        let canonical =
            fs::canonicalize(path).map_err(|e| io_error("open the vault folder", path, e))?;

        let metadata = fs::metadata(&canonical)
            .map_err(|e| io_error("read the vault folder", &canonical, e))?;

        if !metadata.is_dir() {
            return Err(CoreError::VaultRootUnusable {
                path: render(&canonical),
                reason: "it is a file, not a folder",
            });
        }

        Ok(Self { canonical })
    }

    /// The canonical location of the vault on disk.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.canonical
    }

    /// Resolves `relative` against this root, proving it stays inside.
    ///
    /// Components that do not exist yet are fine and are *expected*: this is also how a
    /// new bundle's location is computed before the bundle is created. A component that
    /// does not exist cannot be a link and cannot redirect anywhere, so only the
    /// existing prefix needs inspecting.
    ///
    /// # Known limitation
    ///
    /// The check and the subsequent open are two separate steps, so a component swapped
    /// for a symlink in between would not be caught here (a time-of-check/time-of-use
    /// race). Closing it fully needs `openat`-style calls that `std` does not expose,
    /// and `unsafe` is forbidden in this repository. For a single-user offline app the
    /// residual risk is someone racing their own filesystem; it is recorded in
    /// `PROGRESS.md` rather than papered over. Writes mitigate it separately by opening
    /// with `O_NOFOLLOW`.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::SymlinkRefused`] if any existing component is a symbolic
    /// link, [`CoreError::PathEscapesVault`] if the resolved location is not under the
    /// root, and [`CoreError::Io`] if a component cannot be inspected.
    pub fn resolve(&self, relative: &VaultRelativePath) -> Result<ResolvedPath, CoreError> {
        let mut candidate = self.canonical.clone();
        let mut exists_so_far = true;

        for segment in relative.segments() {
            candidate.push(segment.as_str());

            // Once a component is missing, everything below it is missing too, so there
            // is nothing left to inspect — only path building to finish.
            if !exists_so_far {
                continue;
            }

            match fs::symlink_metadata(&candidate) {
                Ok(metadata) => {
                    if metadata.is_symlink() {
                        return Err(CoreError::SymlinkRefused {
                            path: render(&candidate),
                        });
                    }
                }
                Err(error) if error.kind() == io::ErrorKind::NotFound => {
                    exists_so_far = false;
                }
                Err(error) => {
                    return Err(io_error("inspect", &candidate, error));
                }
            }
        }

        self.confirm_containment(&candidate)?;

        Ok(ResolvedPath {
            absolute: candidate,
        })
    }

    /// Second, independent containment check against the canonical filesystem.
    ///
    /// Refusing symlinks above should already make this redundant, and that is the
    /// point of keeping it: it is cheap, and it does not depend on having enumerated
    /// every way a path can be redirected. macOS firmlinks, for instance, are not
    /// symbolic links and so would not be caught by the walk.
    ///
    /// Honest caveat: this check runs on every resolve, but **no test drives it to
    /// failure**, because provoking it needs a firmlink or an equivalent redirection
    /// that a test cannot create. It is reasoned, not demonstrated. Recorded as such in
    /// `PROGRESS.md` so nobody later mistakes it for covered behaviour.
    fn confirm_containment(&self, candidate: &Path) -> Result<(), CoreError> {
        let existing = deepest_existing(candidate);

        let canonical = fs::canonicalize(&existing)
            .map_err(|e| io_error("check the location of", &existing, e))?;

        if !canonical.starts_with(&self.canonical) {
            return Err(CoreError::PathEscapesVault {
                path: render(candidate),
            });
        }

        Ok(())
    }
}

/// The deepest ancestor of `path` that exists, for canonicalising.
///
/// Terminates because the vault root exists, and `path` is always built from it.
fn deepest_existing(path: &Path) -> PathBuf {
    let mut candidate = path.to_path_buf();

    while fs::symlink_metadata(&candidate).is_err() {
        if !candidate.pop() {
            break;
        }
    }

    candidate
}
