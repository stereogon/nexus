//! Walking a real vault on disk, and loading what the walk finds.
//!
//! Two things live here. [`FsVaultDirectory`] is the filesystem half of the
//! [`VaultDirectory`] port — it lists directories and nothing else, because every rule
//! about *which* directories are lectures belongs to the domain. [`VaultLoader`] then
//! composes that walk with [`ManifestStore`] to turn lecture paths into loaded bundles.
//!
//! The composition is deliberately thin and deliberately here rather than in
//! `lecture-core`: it is "for each path, read a file", and the iPadOS app will compose
//! its own two adapters the same way. What it must *not* do is lose a vault to one bad
//! file, which is the reason [`LoadedVault`] has three lists instead of one.

use std::fs;

use lecture_core::{
    Clock, CoreError, DirectoryEntry, LectureBundle, RelativePath, SkippedDirectory,
    VaultDirectory, scan_vault,
};

use crate::error::io_error;
use crate::manifest_store::ManifestStore;
use crate::vault_root::VaultRoot;

/// Lists directories inside a vault on disk.
pub struct FsVaultDirectory {
    root: VaultRoot,
}

impl FsVaultDirectory {
    /// Lists directories under `root`.
    #[must_use]
    pub fn new(root: VaultRoot) -> Self {
        Self { root }
    }
}

impl VaultDirectory for FsVaultDirectory {
    fn list(&self, at: Option<&RelativePath>) -> Result<Vec<DirectoryEntry>, CoreError> {
        // Resolving is what refuses a symlinked directory, and it is why the walk can
        // report a link accurately instead of calling it unreadable.
        let directory = match at {
            Some(path) => self.root.resolve(path)?.as_path().to_path_buf(),
            None => self.root.as_path().to_path_buf(),
        };

        let listing = fs::read_dir(&directory).map_err(|e| io_error("list", &directory, e))?;
        let mut entries = Vec::new();

        for entry in listing {
            let entry = entry.map_err(|e| io_error("list", &directory, e))?;

            // Lossy rather than skipped. A name this cannot represent is a name the
            // domain will refuse anyway, and it must be *visible* to be reported --
            // dropping it here would make a lecture vanish with no explanation.
            let name = entry.file_name().to_string_lossy().into_owned();

            let file_type = entry
                .file_type()
                .map_err(|e| io_error("inspect", &entry.path(), e))?;

            let kind = if file_type.is_symlink() {
                classify_link(&entry.path())
            } else if file_type.is_dir() {
                lecture_core::EntryKind::Directory
            } else {
                lecture_core::EntryKind::File
            };

            entries.push(DirectoryEntry { name, kind });
        }

        Ok(entries)
    }
}

/// How to present a symbolic link to the walk.
///
/// A link pointing at a *directory* is reported as one, so the walk tries to descend,
/// is refused by `resolve`, and reports it — a symlinked lecture folder would otherwise
/// disappear silently, and someone who linked a folder into their vault has made a
/// mistake worth being told about, because the target will not exist on their other
/// devices.
///
/// A link pointing at a file, or a broken one, is reported as a file. There is no
/// lecture hidden behind it, so reporting it would be noise.
///
/// Following the link to ask what it points at is not the same as following it to read
/// through it: the answer only decides what to *say*, and the refusal still happens.
fn classify_link(path: &std::path::Path) -> lecture_core::EntryKind {
    match fs::metadata(path) {
        Ok(metadata) if metadata.is_dir() => lecture_core::EntryKind::Directory,
        _ => lecture_core::EntryKind::File,
    }
}

/// A lecture whose directory was found but whose manifest could not be loaded.
#[derive(Debug)]
pub struct UnloadableLecture {
    /// Where the lecture is.
    pub directory: RelativePath,
    /// Why it could not be loaded, carrying its own code and remediation.
    pub error: CoreError,
}

/// Everything a scan-and-load found, including what it could not use.
///
/// Three lists rather than one, because a vault of three hundred lectures with one
/// corrupt manifest must still open. Collapsing the failures into the success list would
/// hide them; collapsing them into an overall error would lose the other 299.
#[derive(Debug, Default)]
pub struct LoadedVault {
    /// The lectures that loaded, in path order.
    pub bundles: Vec<LectureBundle>,
    /// Directories the walk could not use, each with a reason to show.
    pub skipped: Vec<SkippedDirectory>,
    /// Lectures found but not loadable.
    pub unloadable: Vec<UnloadableLecture>,
}

/// Walks a vault and loads the manifest of every lecture in it.
pub struct VaultLoader<C> {
    directory: FsVaultDirectory,
    manifests: ManifestStore<C>,
}

impl<C: Clock> VaultLoader<C> {
    /// Loads through `manifests`, walking the same root it writes to.
    #[must_use]
    pub fn new(manifests: ManifestStore<C>) -> Self {
        Self {
            directory: FsVaultDirectory::new(manifests.storage().root().clone()),
            manifests,
        }
    }

    /// Finds every lecture in the vault and loads its manifest.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] only if the vault root itself cannot be read, because
    /// then there is no vault. Everything else is collected into [`LoadedVault`] so one
    /// unreadable folder or one corrupt manifest cannot cost a person their whole vault.
    pub fn load(&self) -> Result<LoadedVault, CoreError> {
        let scan = scan_vault(&self.directory)?;
        let mut loaded = LoadedVault {
            skipped: scan.skipped().to_vec(),
            ..LoadedVault::default()
        };

        for directory in scan.lectures() {
            match self.manifests.load(directory) {
                Ok(manifest) => loaded
                    .bundles
                    .push(LectureBundle::new(directory.clone(), manifest)),
                Err(error) => loaded.unloadable.push(UnloadableLecture {
                    directory: directory.clone(),
                    error,
                }),
            }
        }

        Ok(loaded)
    }
}
