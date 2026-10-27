//! A directory tree described in memory, for driving the vault walk.
//!
//! Shared by the scan test files. Not a test binary itself: Cargo only compiles
//! top-level files in `tests/` as tests, so this is an ordinary module both include.

// A shared harness legitimately has parts one consumer does not use; this is not
// silencing a problem, and each builder below is used by at least one test file.
#![allow(dead_code, clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::collections::BTreeMap;

use lecture_core::{CoreError, DirectoryEntry, RelativePath, VaultDirectory};

/// A directory tree described by path, with a set of paths that refuse to be read.
#[derive(Default)]
pub(crate) struct FakeVault {
    pub(crate) entries: BTreeMap<String, Vec<DirectoryEntry>>,
    pub(crate) unreadable: Vec<String>,
}

impl FakeVault {
    /// Declares a lecture: a directory holding `manifest.json` plus the usual contents.
    pub(crate) fn lecture(mut self, at: &str) -> Self {
        self.add_parents(at);
        self.entries.insert(
            at.to_owned(),
            vec![
                DirectoryEntry::file("manifest.json"),
                DirectoryEntry::file("notes.md"),
                DirectoryEntry::file("annotations.json"),
                DirectoryEntry::directory("source"),
                DirectoryEntry::directory("assets"),
            ],
        );
        self.entries.insert(
            format!("{at}/source"),
            vec![DirectoryEntry::file("document.pdf")],
        );
        self.entries.insert(format!("{at}/assets"), Vec::new());
        self
    }

    /// Declares a plain directory with no manifest.
    pub(crate) fn folder(mut self, at: &str) -> Self {
        self.add_parents(at);
        self.entries.entry(at.to_owned()).or_default();
        self
    }

    /// Declares a directory whose listing fails.
    pub(crate) fn unreadable(mut self, at: &str) -> Self {
        self.add_parents(at);
        self.unreadable.push(at.to_owned());
        self
    }

    /// Ensures every ancestor lists the next segment down.
    fn add_parents(&mut self, at: &str) {
        let segments: Vec<&str> = at.split('/').collect();

        for depth in 0..segments.len() {
            let parent = segments.get(..depth).unwrap_or_default().join("/");
            let child = segments.get(depth).copied().unwrap_or_default();
            let listing = self.entries.entry(parent).or_default();

            if !listing.iter().any(|e| e.name == child) {
                listing.push(DirectoryEntry::directory(child));
            }
        }
    }
}

impl VaultDirectory for FakeVault {
    fn list(&self, at: Option<&RelativePath>) -> Result<Vec<DirectoryEntry>, CoreError> {
        let key = at.map(ToString::to_string).unwrap_or_default();

        if self.unreadable.contains(&key) {
            return Err(CoreError::Io {
                operation: "read",
                path: key,
                source: std::io::Error::from(std::io::ErrorKind::PermissionDenied),
            });
        }

        Ok(self.entries.get(&key).cloned().unwrap_or_default())
    }
}

/// The lecture paths a scan of `vault` finds, as strings.
pub(crate) fn found(vault: &FakeVault) -> Vec<String> {
    lecture_core::scan_vault(vault)
        .unwrap()
        .lectures()
        .iter()
        .map(ToString::to_string)
        .collect()
}
