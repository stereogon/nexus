//! A temporary vault holding one lecture, for tests that need somewhere real to work.

use std::fs;
use std::path::PathBuf;

use lecture_fs::{AtomicFsStorage, VaultRoot};
use tempfile::TempDir;

/// A vault holding one lecture whose original is waiting to be converted.
pub(crate) struct Fixture {
    /// Held only so that dropping the fixture removes the directory.
    _vault: TempDir,
    root: PathBuf,
    pub(crate) profiles: TempDir,
}

impl Fixture {
    /// Creates `cs454/raft/source/original.pptx` inside a fresh vault.
    pub(crate) fn new() -> Self {
        let vault = TempDir::new().expect("a temporary vault");
        let root = vault.path().join("vault");
        let source = root.join("cs454").join("raft").join("source");
        fs::create_dir_all(&source).expect("the bundle layout");
        fs::write(source.join("original.pptx"), b"a slide deck").expect("the original");

        Self {
            _vault: vault,
            root,
            profiles: TempDir::new().expect("a temporary profiles directory"),
        }
    }

    pub(crate) fn storage(&self) -> AtomicFsStorage {
        AtomicFsStorage::new(VaultRoot::open(&self.root).expect("the vault should open"))
    }

    /// The absolute path of something inside the lecture's `source/` directory.
    pub(crate) fn in_source(&self, name: &str) -> PathBuf {
        self.root
            .join("cs454")
            .join("raft")
            .join("source")
            .join(name)
    }
}
