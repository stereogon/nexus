//! A location inside the vault, proven to stay inside it.
//!
//! # What this type guarantees
//!
//! A [`VaultRelativePath`] is a sequence of at most [`MAX_DEPTH`] validated [`Slug`]s.
//! Because a `Slug` can be neither empty, nor `.`, nor `..`, nor contain a separator,
//! there is no sequence of them that walks upward. So [`VaultRelativePath::join_onto`]
//! is **lexically** always inside the root it is given, and that is a property of the
//! type rather than of each caller remembering to check.
//!
//! This is the "parse, don't validate" shape used by the rest of this module: holding
//! the value *is* the proof, so no downstream caller has to re-check and none can
//! forget to. The final segment is stored apart from the rest for the same reason — a
//! path that names nothing cannot be built, so [`VaultRelativePath::name`] needs no
//! fallback and no panic.
//!
//! # What this type does not guarantee
//!
//! It knows nothing about the disk. If `lectures` on disk is a symbolic link pointing at
//! `/etc`, then `lectures/passwd` is a perfectly valid `VaultRelativePath` whose
//! resolved location is outside the vault. Closing that requires canonicalising real
//! directory entries and refusing links, which is filesystem work and so belongs to the
//! storage adapter, not to pure domain logic. Until that lands, this type is the barrier
//! against hostile *text*, not against a hostile *filesystem*.

use std::fmt;
use std::iter;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::domain::Slug;
use crate::error::CoreError;

/// The deepest a lecture may sit below the vault root, in segments.
///
/// Five is the cap the spec sets. It is enforced here rather than at the UI, because a
/// path can also arrive from a hand-edited manifest, and an unbounded depth turns a
/// vault walk into an unbounded recursion.
pub const MAX_DEPTH: usize = 5;

/// The separator used in stored vault paths, on every platform.
///
/// Manifests record `assets/figure.png`, never a backslash, so a bundle stays readable
/// by the iPadOS companion and by whatever opens it in five years. `Slug` rejects both
/// separators, so neither can appear inside a segment.
const SEPARATOR: char = '/';

/// A validated, relative, depth-capped path inside the vault.
///
/// Always names something: the trailing segment is part of the structure, so there is no
/// such thing as an empty `VaultRelativePath`.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct VaultRelativePath {
    /// Containing folders, outermost first. Empty when this sits at the vault root.
    parents: Vec<Slug>,
    /// The thing this path points at.
    name: Slug,
}

impl TryFrom<String> for VaultRelativePath {
    type Error = CoreError;

    fn try_from(raw: String) -> Result<Self, Self::Error> {
        Self::parse(&raw)
    }
}

impl From<VaultRelativePath> for String {
    fn from(path: VaultRelativePath) -> Self {
        path.to_string()
    }
}

impl fmt::Display for VaultRelativePath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (index, segment) in self.segments().enumerate() {
            if index > 0 {
                f.write_str("/")?;
            }
            f.write_str(segment.as_str())?;
        }
        Ok(())
    }
}

impl VaultRelativePath {
    /// Parses a stored or user-supplied vault path.
    ///
    /// Each segment is validated as a [`Slug`], and that error is propagated unchanged
    /// rather than flattened into something generic — a person who typed a colon is told
    /// about the colon.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::VaultPathTooDeep`] beyond [`MAX_DEPTH`] segments,
    /// [`CoreError::InvalidVaultPath`] if the path is empty, absolute, or has an empty
    /// segment, and [`CoreError::InvalidName`] if a segment is not a usable name.
    pub fn parse(raw: &str) -> Result<Self, CoreError> {
        if raw.is_empty() {
            return Err(Self::invalid(raw, "a vault path cannot be empty"));
        }
        if raw.starts_with(SEPARATOR) {
            return Err(Self::invalid(
                raw,
                "is an absolute path, which cannot point inside the vault",
            ));
        }

        // Counted before any segment is parsed, so a pathologically deep path is refused
        // in one pass instead of validating thousands of segments first.
        let depth = raw.split(SEPARATOR).count();
        if depth > MAX_DEPTH {
            return Err(Self::too_deep(raw, depth));
        }

        let mut segments = Vec::with_capacity(depth);
        for piece in raw.split(SEPARATOR) {
            if piece.is_empty() {
                return Err(Self::invalid(raw, "contains an empty folder name"));
            }
            segments.push(Slug::parse(piece)?);
        }

        Self::from_segments(segments)
    }

    /// Builds a path from segments that are already validated names.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidVaultPath`] if `segments` is empty, or
    /// [`CoreError::VaultPathTooDeep`] beyond [`MAX_DEPTH`].
    pub fn from_segments(mut segments: Vec<Slug>) -> Result<Self, CoreError> {
        let depth = segments.len();
        if depth > MAX_DEPTH {
            let rendered = segments
                .iter()
                .map(Slug::as_str)
                .collect::<Vec<_>>()
                .join("/");
            return Err(Self::too_deep(&rendered, depth));
        }

        let Some(name) = segments.pop() else {
            return Err(Self::invalid("", "a vault path must name something"));
        };

        Ok(Self {
            parents: segments,
            name,
        })
    }

    /// A path naming `name` directly at the vault root.
    #[must_use]
    pub fn root_level(name: Slug) -> Self {
        Self {
            parents: Vec::new(),
            name,
        }
    }

    /// Resolves this path against `root`.
    ///
    /// The result is lexically always inside `root`. It is **not** canonicalised and no
    /// filesystem call is made, which is deliberate: the path need not exist yet, since
    /// this is also how a new bundle's location is computed before it is created.
    /// Verifying the resolved location on disk — and refusing symbolic links — is the
    /// storage adapter's job.
    #[must_use]
    pub fn join_onto(&self, root: &Path) -> PathBuf {
        let mut resolved = root.to_path_buf();
        for segment in self.segments() {
            resolved.push(segment.as_str());
        }
        resolved
    }

    /// The segments, outermost first. Never empty.
    pub fn segments(&self) -> impl Iterator<Item = &Slug> {
        self.parents.iter().chain(iter::once(&self.name))
    }

    /// How many levels below the vault root this sits. Never zero.
    #[must_use]
    pub fn depth(&self) -> usize {
        self.parents.len() + 1
    }

    /// The final segment: the name of the thing this path points at.
    #[must_use]
    pub fn name(&self) -> &Slug {
        &self.name
    }

    /// The containing path, or `None` if this already sits at the vault root.
    #[must_use]
    pub fn parent(&self) -> Option<Self> {
        let mut parents = self.parents.clone();
        let name = parents.pop()?;
        Some(Self { parents, name })
    }

    /// This path with `name` appended.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::VaultPathTooDeep`] if appending would pass [`MAX_DEPTH`].
    pub fn child(&self, name: Slug) -> Result<Self, CoreError> {
        let mut segments: Vec<Slug> = self.segments().cloned().collect();
        segments.push(name);
        Self::from_segments(segments)
    }

    fn invalid(path: &str, reason: &'static str) -> CoreError {
        CoreError::InvalidVaultPath {
            path: path.to_owned(),
            reason,
        }
    }

    fn too_deep(path: &str, depth: usize) -> CoreError {
        CoreError::VaultPathTooDeep {
            path: path.to_owned(),
            depth,
            max: MAX_DEPTH,
        }
    }
}
