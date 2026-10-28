//! Making a real vault's folder names match its `sequence` keys.
//!
//! Planning lives in `lecture-core`; this performs the renames. The split matters because
//! the ordering guarantee is the hard part and is worth testing without a filesystem,
//! while what is left here is the part that can actually damage someone's folders.
//!
//! # Stopping on the first failure is correct, not a shortcut
//!
//! The plan's renames are ordered: each one frees a name that a later one needs. Carrying
//! on past a failure would mean a later rename finding its target still occupied, so it
//! would either be refused or — without the refusal — overwrite something. Stopping keeps
//! the vault in a state the plan can be recomputed from.
//!
//! And stopping is cheap, because a renumber touches only the derived projection.
//! `sequence` is never written, so a half-finished run still shows the right order in the
//! app; only the Finder-facing names are briefly inconsistent, and running it again
//! finishes the job.

use lecture_core::{
    Clock, CoreError, OrderKey, OrderedFolder, RelativePath, RenumberPlan, Slug, plan_renumber,
};

use crate::manifest_store::ManifestStore;
use crate::vault::FsVaultDirectory;
use lecture_core::VaultDirectory;

/// What a renumber actually did.
#[derive(Debug, Default)]
pub struct RenumberOutcome {
    /// Lectures that moved, as full vault paths, so anything keyed by path can follow.
    pub moved: Vec<(RelativePath, RelativePath)>,
    /// How many directory renames were performed, temporary names included.
    pub renames_applied: usize,
    /// Why it stopped early, if it did.
    pub stopped_by: Option<CoreError>,
}

impl RenumberOutcome {
    /// Whether every rename in the plan was applied.
    #[must_use]
    pub fn is_complete(&self) -> bool {
        self.stopped_by.is_none()
    }
}

/// Plans and applies renumbering for one directory of lectures.
pub struct VaultRenumber<C> {
    directory: FsVaultDirectory,
    manifests: ManifestStore<C>,
}

impl<C: Clock> VaultRenumber<C> {
    /// Renumbers inside the vault `manifests` reads from.
    #[must_use]
    pub fn new(manifests: ManifestStore<C>) -> Self {
        Self {
            directory: FsVaultDirectory::new(manifests.storage().root().clone()),
            manifests,
        }
    }

    /// Works out what `parent`'s lecture folders should be called.
    ///
    /// `None` means the vault root. Only direct children are considered, because a `NN-`
    /// prefix orders siblings and nothing else; a nested folder is renumbered by its own
    /// parent.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] if the directory cannot be listed. A child whose
    /// manifest cannot be read is left out of the plan rather than failing it: the rest
    /// of the folder can still be tidied, and a lecture with an unreadable manifest has a
    /// louder problem than its folder name.
    pub fn plan(&self, parent: Option<&RelativePath>) -> Result<RenumberPlan, CoreError> {
        let entries = self.directory.list(parent)?;
        let mut folders = Vec::new();

        for entry in &entries {
            if !entry.is_directory() {
                continue;
            }

            let Ok(name) = Slug::parse(&entry.name) else {
                continue;
            };

            let child = child_path(parent, &name)?;

            if let Some(sequence) = self.sequence_of(&child) {
                folders.push(OrderedFolder::new(name, sequence));
            }
        }

        plan_renumber(&folders, &entries)
    }

    /// The `sequence` of the lecture at `directory`, if there is a readable one there.
    fn sequence_of(&self, directory: &RelativePath) -> Option<OrderKey> {
        self.manifests
            .load(directory)
            .ok()
            .map(|manifest| manifest.sequence().clone())
    }

    /// Applies `plan` to `parent`, stopping at the first rename that fails.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError`] only if a path in the plan cannot be resolved against the
    /// vault at all. A rename that fails is recorded in the outcome instead, because the
    /// caller needs to know what *did* happen, and a partial renumber is a recoverable
    /// state rather than an error.
    pub fn apply(
        &self,
        parent: Option<&RelativePath>,
        plan: &RenumberPlan,
    ) -> Result<RenumberOutcome, CoreError> {
        let mut outcome = RenumberOutcome::default();

        for rename in plan.renames() {
            let from = child_path(parent, &rename.from)?;
            let to = child_path(parent, &rename.to)?;

            if let Err(error) = self.manifests.storage().rename(&from, &to) {
                outcome.stopped_by = Some(error);
                return Ok(outcome);
            }

            outcome.renames_applied += 1;
        }

        for (from, to) in plan.net_moves() {
            outcome
                .moved
                .push((child_path(parent, &from)?, child_path(parent, &to)?));
        }

        Ok(outcome)
    }
}

/// `parent/name`, or `name` at the vault root.
fn child_path(parent: Option<&RelativePath>, name: &Slug) -> Result<RelativePath, CoreError> {
    match parent {
        Some(path) => path.child(name.clone()),
        None => RelativePath::from_segments(vec![name.clone()]),
    }
}
