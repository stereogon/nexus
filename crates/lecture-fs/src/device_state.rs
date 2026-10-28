//! Reading and writing this device's own state, outside any vault.
//!
//! # Where it goes, and why not in the vault
//!
//! `~/Library/Application Support/Nexus/vaults/<key>/view-state.json`.
//!
//! `CLAUDE.md` §3 makes "can a vault scan rebuild it?" the test for what may live in
//! `.nexus/`. A reading position cannot be rebuilt from a scan, so it fails that test and
//! would have cost `.nexus/` its one real guarantee. Being outside the vault also means no
//! sync client can see it, so there is nothing to conflict over — rather than a file that
//! merely usually does not conflict.
//!
//! # The location is injectable, and that is not only for tests
//!
//! [`DeviceStateStore::under`] takes the base directory. Tests use a temporary one, so no
//! test in this repository writes to the real `~/Library`. It is also the honest shape:
//! "where does this device keep things" is a platform decision, and hardcoding one path
//! inside the store would make the store untestable *and* wrong for the iPad.

use std::fs;
use std::path::{Path, PathBuf};

use lecture_core::{
    CoreError, RelativePath, Slug, VIEW_STATE_FILE_NAME, ViewState, fingerprint_hex,
};

use crate::error::io_error;
use crate::logging;
use crate::storage::AtomicFsStorage;
use crate::vault_root::VaultRoot;
use crate::versioned;

/// The app's own folder inside Application Support.
pub const APP_SUPPORT_DIR_NAME: &str = "Nexus";

/// Holds one subfolder per vault this device has opened.
pub const VAULTS_DIR_NAME: &str = "vaults";

/// Names which vault a key belongs to, for a human reading the folder.
///
/// Written on save and **never read back**. It exists because
/// `vaults/8f3a1c0b5e2d7946/` is otherwise unidentifiable six months later, and the
/// alternative — a readable key built from the vault's path — runs into filename length
/// limits and names that a path segment cannot hold.
pub const VAULT_PATH_FILE_NAME: &str = "vault-path.txt";

/// Reads and writes one vault's per-device state.
pub struct DeviceStateStore {
    storage: AtomicFsStorage,
    vault_path: PathBuf,
}

impl DeviceStateStore {
    /// Keeps state in the real Application Support directory.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::HomeDirectoryUnavailable`] if `HOME` is unset, and
    /// [`CoreError::Io`] if the directory cannot be created.
    pub fn for_vault(vault: &VaultRoot) -> Result<Self, CoreError> {
        let home = std::env::var_os("HOME").ok_or(CoreError::HomeDirectoryUnavailable)?;

        Self::under(&state_base(Path::new(&home)), vault)
    }

    /// Keeps state under `base`, creating the directories it needs.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] if the directory cannot be created or inspected.
    pub fn under(base: &Path, vault: &VaultRoot) -> Result<Self, CoreError> {
        let directory = base.join(VAULTS_DIR_NAME).join(vault_key(vault.path()));

        fs::create_dir_all(&directory)
            .map_err(|e| io_error("create the app support folder", &directory, e))?;

        Ok(Self {
            storage: AtomicFsStorage::new(VaultRoot::open(&directory)?),
            vault_path: vault.path().to_path_buf(),
        })
    }

    /// Reads this device's state, or returns an empty one.
    ///
    /// Infallible for the same reason the index cache is: every way this can fail has the
    /// same answer, which is to open at the first page. Losing it costs a scroll
    /// position, so a damaged file is discarded rather than copied to `.bak` — there is
    /// no work in here to preserve, and the rule throughout is to back up what holds work
    /// and discard what does not.
    #[must_use]
    pub fn load(&self) -> ViewState {
        let Ok(path) = state_path() else {
            return ViewState::empty();
        };

        let bytes = match self.storage.read(&path) {
            Ok(bytes) => bytes,
            Err(error) => {
                // No state yet is the normal case on a new device.
                if !versioned::is_missing(&error) {
                    logging::failure("read this device's view state", &error);
                }

                return ViewState::empty();
            }
        };

        serde_json::from_slice(&bytes).unwrap_or_else(|_| {
            logging::derived_file_discarded(VIEW_STATE_FILE_NAME);
            ViewState::empty()
        })
    }

    /// Writes this device's state.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] if the write fails. A caller that ignores this loses a
    /// reading position and nothing else, so it returns `Result` rather than swallowing
    /// the error while staying safe to ignore deliberately.
    pub fn save(&self, state: &ViewState) -> Result<(), CoreError> {
        self.write_vault_breadcrumb();

        versioned::save(&self.storage, &state_path()?, state)
    }

    /// Records which vault this folder belongs to, best-effort.
    ///
    /// Deliberately ignores its own failure: it is a note for a human, and failing to
    /// write a breadcrumb must never be the reason someone's reading position is lost.
    fn write_vault_breadcrumb(&self) {
        let Ok(path) = breadcrumb_path() else {
            return;
        };

        let note = format!("{}\n", self.vault_path.display());
        let _ = self.storage.write(&path, note.as_bytes());
    }
}

/// Where Nexus keeps per-device state, given a home directory.
///
/// Pure, so the layout is testable without a real `HOME` and without creating anything.
#[must_use]
pub fn state_base(home: &Path) -> PathBuf {
    home.join("Library")
        .join("Application Support")
        .join(APP_SUPPORT_DIR_NAME)
}

/// A stable, filesystem-safe folder name for a vault.
///
/// A [`fingerprint_hex`] of the canonical path. The obvious alternative — encoding the
/// path into the folder name — hits the 255-byte filename limit for a deep vault and
/// cannot represent every legal directory name as a path segment.
///
/// A collision would mean two vaults sharing a reading position, which is an annoyance
/// rather than a loss, and [`VAULT_PATH_FILE_NAME`] records which vault a folder was
/// written for. See [`fingerprint_hex`] for why the hash is not `DefaultHasher`.
fn vault_key(canonical: &Path) -> String {
    fingerprint_hex(canonical.as_os_str().as_encoded_bytes())
}

/// `view-state.json`, inside this vault's state folder.
fn state_path() -> Result<RelativePath, CoreError> {
    RelativePath::from_segments(vec![Slug::internal(VIEW_STATE_FILE_NAME)?])
}

/// `vault-path.txt`, beside it.
fn breadcrumb_path() -> Result<RelativePath, CoreError> {
    RelativePath::from_segments(vec![Slug::internal(VAULT_PATH_FILE_NAME)?])
}
