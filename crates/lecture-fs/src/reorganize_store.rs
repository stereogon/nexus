//! Moving a real vault's lecture folders to where its facets say they belong.
//!
//! Planning lives in `lecture-core`; this performs the moves. The split is the same one
//! [`crate::renumber_store`] makes and for the same reason: the ordering guarantee is the
//! hard part and is worth testing without a filesystem, while what is left here is the
//! part that can actually damage someone's folders.
//!
//! # A half-finished reorganize is a valid vault
//!
//! Unlike a renumber, this moves lectures for real rather than touching a derived
//! projection — so it is worth being precise about why stopping part-way is still safe.
//!
//! §3: *"No central index is a source of truth"*, and *"everything inside a bundle is
//! referenced relatively"*. So a lecture that moved and a lecture that did not are both
//! still lectures: each is a directory holding its own `manifest.json`, each is found by
//! the next vault walk, and nothing anywhere records where either of them used to be.
//! Re-running recomputes the plan from where things actually are and finishes the job.
//!
//! One thing does not follow by itself: per-device [`lecture_core::ViewState`] is keyed by
//! lecture path, so a move orphans a remembered page and scroll offset. That is why
//! [`ReorganizeOutcome::moved`] reports the net effect — the caller owning device state is
//! the one that can update it, and §1.4 says losing someone's place is not acceptable just
//! because it is only a scroll position.
//!
//! # Stopping on the first failure is correct, not a shortcut
//!
//! The plan's moves are ordered so each target is free when its turn comes, including the
//! temporary name that breaks a cycle. Carrying on past a failure would mean a later move
//! finding its target still occupied, so it would either be refused or — without
//! [`crate::AtomicFsStorage::rename`]'s refusal — overwrite a folder full of someone's
//! notes.

use std::collections::BTreeSet;

use lecture_core::{
    Clock, CoreError, Move, PathTemplate, PlacedLecture, RelativePath, ReorganizePlan,
    plan_reorganize,
};

use crate::logging;
use crate::manifest_store::ManifestStore;
use crate::vault::LoadedVault;

/// What a reorganize actually did.
#[derive(Debug, Default)]
pub struct ReorganizeOutcome {
    /// Where each lecture ended up, net of any temporary name, so anything keyed by path
    /// can follow it.
    pub moved: Vec<(RelativePath, RelativePath)>,
    /// How many directory moves were performed, temporary names included.
    pub moves_applied: usize,
    /// Why it stopped early, if it did.
    pub stopped_by: Option<CoreError>,
}

impl ReorganizeOutcome {
    /// Whether every move in the plan was applied.
    #[must_use]
    pub fn is_complete(&self) -> bool {
        self.stopped_by.is_none()
    }
}

/// Plans and applies filing a vault's lectures under a path template.
pub struct VaultReorganize<C> {
    manifests: ManifestStore<C>,
}

impl<C: Clock> VaultReorganize<C> {
    /// Reorganizes the vault `manifests` reads from.
    #[must_use]
    pub fn new(manifests: ManifestStore<C>) -> Self {
        Self { manifests }
    }

    /// Works out where every lecture in `vault` belongs under `template`.
    ///
    /// Touches nothing. The returned plan is the dry run: the moves it would make, and
    /// every lecture it could not file together with why.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] if a target cannot be tested for occupancy. A lecture
    /// whose target cannot be rendered at all — a title with nothing usable in it — is
    /// reported in the plan as [`lecture_core::ReorganizeBlock::NameUnusable`] rather than
    /// failing the whole plan, because one unnameable lecture must not stop the other
    /// hundred being tidied.
    pub fn plan(
        &self,
        vault: &LoadedVault,
        template: &PathTemplate,
    ) -> Result<ReorganizePlan, CoreError> {
        let mut placed = Vec::new();
        let mut unnameable = Vec::new();

        for bundle in &vault.bundles {
            let manifest = bundle.manifest();

            match template.place(manifest.facets(), manifest.title()) {
                Ok(target) => placed.push(PlacedLecture::new(bundle.directory().clone(), target)),
                // Reported rather than quietly left alone: a lecture with no week, under a
                // template that needs one, is something the person can fix -- and being
                // told is the difference between a gap and a mystery.
                //
                // The reason travels with it. This line used to be `Err(_)`, throwing away
                // the only thing that distinguishes "this title is all punctuation" from
                // "this lecture has no week yet", which left the second one being told to
                // fix its perfectly good title.
                Err(reason) => unnameable.push((bundle.directory().clone(), reason)),
            }
        }

        let occupied = self.occupants(&placed)?;

        Ok(plan_reorganize(&placed, &unnameable, &occupied))
    }

    /// The paths a lecture wants that something else already holds.
    ///
    /// Only targets are tested, because a target is the only path a move can collide with.
    /// A lecture's own current directory does not count as an occupant of its own target —
    /// a lecture already in the right place is unchanged, not blocked.
    fn occupants(&self, placed: &[PlacedLecture]) -> Result<Vec<RelativePath>, CoreError> {
        let ours: BTreeSet<&RelativePath> = placed.iter().map(PlacedLecture::at).collect();
        let mut occupied = BTreeSet::new();

        for lecture in placed {
            let target = lecture.target();

            // Held by a lecture in this same reorganize: that is the planner's problem to
            // order, not an outside obstacle.
            if ours.contains(target) {
                continue;
            }

            if self.manifests.storage().exists(target)? {
                occupied.insert(target.clone());
            }
        }

        Ok(occupied.into_iter().collect())
    }

    /// Applies `plan`, stopping at the first move that fails.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError`] only if a path in the plan cannot be resolved against the
    /// vault at all. A move that fails is recorded in the outcome instead, because the
    /// caller needs to know what *did* happen, and a partial reorganize is a recoverable
    /// state rather than an error.
    pub fn apply(&self, plan: &ReorganizePlan) -> Result<ReorganizeOutcome, CoreError> {
        let mut outcome = ReorganizeOutcome::default();

        for step in plan.moves() {
            if let Err(error) = self.perform(step) {
                logging::failure("move a lecture folder", &error);
                outcome.stopped_by = Some(error);
                logging::reorganized(outcome.moves_applied, false);

                return Ok(outcome);
            }

            outcome.moves_applied += 1;
        }

        logging::reorganized(outcome.moves_applied, true);
        outcome.moved = plan.net_moves();

        Ok(outcome)
    }

    /// One move: make sure the target's parents exist, then move into it.
    ///
    /// `rename` refuses an occupied target rather than replacing it, which is what keeps a
    /// move that the plan did not expect from deleting a folder of someone's notes.
    fn perform(&self, step: &Move) -> Result<(), CoreError> {
        if let Some(parent) = step.to.parent() {
            self.manifests.storage().create_dir(&parent)?;
        }

        self.manifests.storage().rename(&step.from, &step.to)
    }
}
