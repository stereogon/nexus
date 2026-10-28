//! A vault, and somewhere outside it for a file to arrive from.
//!
//! Included per test binary with `#[path]`, so a binary that needs no converter double does
//! not compile one and trip `dead_code`.

use std::fs;
use std::path::{Path, PathBuf};

use lecture_core::{Facets, FixedClock, Label, OrderKey, RelativePath, Timestamp};
use lecture_fs::{AtomicFsStorage, ImportRequest, Importer, VaultRoot};
use tempfile::TempDir;

pub(crate) struct Fixture {
    _directory: TempDir,
    pub(crate) vault: PathBuf,
    incoming: PathBuf,
}

impl Fixture {
    pub(crate) fn new() -> Self {
        let directory = TempDir::new().unwrap();
        let vault = directory.path().join("StudyVault");
        let incoming = directory.path().join("Downloads");
        fs::create_dir_all(&vault).unwrap();
        fs::create_dir_all(&incoming).unwrap();

        Self {
            _directory: directory,
            vault,
            incoming,
        }
    }

    /// A file waiting outside the vault, as a download would be.
    pub(crate) fn waiting(&self, name: &str, bytes: &[u8]) -> PathBuf {
        let at = self.incoming.join(name);
        fs::write(&at, bytes).unwrap();

        at
    }

    pub(crate) fn importer(&self) -> Importer<FixedClock> {
        Importer::new(self.storage(), FixedClock::new(instant()))
    }

    pub(crate) fn storage(&self) -> AtomicFsStorage {
        AtomicFsStorage::new(VaultRoot::open(&self.vault).unwrap())
    }

    pub(crate) fn in_bundle(&self, name: &str) -> PathBuf {
        self.vault
            .join("cs454")
            .join("raft")
            .join("source")
            .join(name)
    }
}

pub(crate) fn instant() -> Timestamp {
    Timestamp::parse("2026-10-28T11:00:00Z").unwrap()
}

pub(crate) fn request(file: &Path) -> ImportRequest<'_> {
    ImportRequest {
        file,
        bundle: RelativePath::parse("cs454/raft").unwrap(),
        title: Label::parse("Raft and consensus").unwrap(),
        sequence: OrderKey::first(),
        facets: Facets::default(),
    }
}
