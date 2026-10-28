//! Reading a stored file's schema version before trusting the rest of it.

use serde::Deserialize;

/// Just enough of any versioned file to read its version.
///
/// A file written by a newer build may not deserialise as the current shape at all, so
/// the version has to be readable on its own. Unknown fields are allowed *here*
/// precisely because this probe's whole job is to inspect a file it does not understand.
///
/// Shared by `manifest.json` and `annotations.json`. The two carry independent version
/// numbers — they change for different reasons, and coupling them would force a
/// migration of one whenever the other grew a field — but they are *read* the same way.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaProbe {
    /// The version the file claims to be.
    pub schema_version: u32,
}

/// The span of schema versions a build can read for one kind of file.
///
/// A type rather than two `u32` parameters because the two are trivially swappable and
/// swapping them silently inverts the check — a build would then accept exactly the files
/// it cannot read. Named construction makes that mistake unspellable.
///
/// Carrying the whole span, rather than only the current version, is what lets an older
/// file be *upgraded* instead of refused. Refusing one would be wrong in a way that is
/// easy to miss: the file is not damaged and the person cannot do anything about it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SchemaRange {
    oldest_readable: u32,
    current: u32,
}

impl SchemaRange {
    /// A span from `oldest_readable` up to and including `current`.
    ///
    /// # Panics
    ///
    /// Panics if `oldest_readable` exceeds `current`. Every range is a `const`, so this is
    /// a compile-time failure rather than something a run can reach — which is why it is
    /// allowed to panic at all.
    #[must_use]
    pub const fn new(oldest_readable: u32, current: u32) -> Self {
        assert!(
            oldest_readable <= current,
            "a schema range cannot start after it ends"
        );

        Self {
            oldest_readable,
            current,
        }
    }

    /// A file format with exactly one known version.
    ///
    /// For derived files, where an unrecognised version is discarded rather than
    /// migrated, so there is nothing for a span to express.
    #[must_use]
    pub const fn exact(version: u32) -> Self {
        Self::new(version, version)
    }

    /// Whether a file at `version` can be read.
    #[must_use]
    pub const fn accepts(self, version: u32) -> bool {
        version >= self.oldest_readable && version <= self.current
    }

    /// Whether a readable file at `version` is older than what this build writes.
    ///
    /// True means the value in memory is an upgrade of what is on disk, so the next save
    /// rewrites the file at the current version. Saving is what performs the migration;
    /// reading never writes.
    #[must_use]
    pub const fn needs_upgrade(self, version: u32) -> bool {
        self.accepts(version) && version < self.current
    }

    /// The version this build writes.
    #[must_use]
    pub const fn current(self) -> u32 {
        self.current
    }

    /// The oldest version this build can still read.
    #[must_use]
    pub const fn oldest_readable(self) -> u32 {
        self.oldest_readable
    }

    /// The error for a file this build cannot read.
    ///
    /// Built here so no call site can fill the fields in wrongly, and so the one place
    /// that describes an unreadable version is the one place that knows the range.
    #[must_use]
    pub const fn reject(self, file: &'static str, found: u32) -> crate::error::CoreError {
        crate::error::CoreError::SchemaVersionUnsupported {
            file,
            found,
            oldest_readable: self.oldest_readable,
            current: self.current,
        }
    }
}
