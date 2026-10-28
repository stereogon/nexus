//! Filing the whole vault's folders to match its facets.
//!
//! Two commands, because §3 asks for a dry run: one says what would happen, the other does
//! it. The folder layout is a *derived projection* of the facets — facets and `sequence`
//! stay authoritative — so this is about making Finder and the Files app legible, not about
//! changing what anything means.
//!
//! # Applying re-plans rather than trusting a plan from the UI
//!
//! A plan is a snapshot of a vault. Accepting one back from the frontend would mean moving
//! real folders according to a view that may be stale — and the frontend could not be the
//! one to notice, because staleness is a fact about the disk. So `apply` plans again and
//! reports what it actually did. If someone edited a facet between previewing and
//! applying, re-planning is the more correct answer rather than a compromise.

use std::path::Path;

use lecture_core::{PathTemplate, RelativePath, ReorganizeBlock};
use lecture_fs::{
    AtomicFsStorage, DeviceStateStore, ManifestStore, SystemClock, VaultLoader, VaultReorganize,
    VaultRoot, logging, state_base,
};
use serde::Serialize;

use lecture_core::CoreError;

use crate::vault::CommandError;

/// One move the reorganize would make, or made.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveRow {
    /// Where the lecture is now.
    pub from: String,
    /// Where it is going.
    pub to: String,
}

/// One lecture that cannot be filed, and something to do about it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockedRow {
    /// Where the lecture still is.
    pub directory: String,
    /// Where it wanted to go, or `null` when the template gave it no usable name at all.
    pub wanted: Option<String>,
    /// A machine code for the obstacle.
    pub reason: &'static str,
    /// A sentence saying what to do next.
    pub remediation: &'static str,
}

/// What a reorganize would do. This is the dry-run preview.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorganizePreview {
    /// The moves, in the order they would be performed.
    pub moves: Vec<MoveRow>,
    /// Lectures that cannot be filed, each with a reason.
    pub blocked: Vec<BlockedRow>,
    /// How many lectures are already where they belong.
    pub unchanged: usize,
}

/// What a reorganize actually did.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorganizeResult {
    /// Where each lecture ended up, net of any temporary name.
    pub moved: Vec<MoveRow>,
    /// Lectures that could not be filed, carried over from the plan.
    pub blocked: Vec<BlockedRow>,
    /// Whether every move in the plan was applied.
    pub complete: bool,
    /// Why it stopped early, if it did. A partial reorganize is recoverable, so this is
    /// reported rather than raised: re-running finishes the job.
    pub stopped_by: Option<CommandError>,
    /// Why the remembered reading positions could not follow the moves, if they could not.
    ///
    /// Separate from [`stopped_by`], which is about the folders. The folders moved either
    /// way; what is lost here is the page each lecture was open at, and it rebuilds as each
    /// one is opened again.
    ///
    /// [`stopped_by`]: ReorganizeResult::stopped_by
    pub positions_lost: Option<CommandError>,
}

/// The wire name for an obstacle. Spelled out rather than derived, so the strings the UI
/// matches on are chosen here and cannot drift when a variant is renamed.
const fn name_of(reason: ReorganizeBlock) -> &'static str {
    match reason {
        ReorganizeBlock::TargetOccupied => "targetOccupied",
        ReorganizeBlock::SharedTarget => "sharedTarget",
        ReorganizeBlock::NameUnusable => "nameUnusable",
        ReorganizeBlock::CycleUnbreakable => "cycleUnbreakable",
    }
}

/// Says what filing the vault under `template` would do, without touching anything.
///
/// # Errors
///
/// Returns [`CommandError`] if the vault cannot be read or `template` is not a usable
/// pattern.
#[tauri::command]
pub async fn preview_reorganize(
    vault: String,
    template: String,
) -> Result<ReorganizePreview, CommandError> {
    tauri::async_runtime::spawn_blocking(move || preview(&vault, &template))
        .await
        .map_err(|_| interrupted())?
}

/// Files the vault's folders under `template`.
///
/// # Errors
///
/// As [`preview_reorganize`]. A move that fails is reported in
/// [`ReorganizeResult::stopped_by`] rather than raised.
#[tauri::command]
pub async fn apply_reorganize(
    vault: String,
    template: String,
) -> Result<ReorganizeResult, CommandError> {
    tauri::async_runtime::spawn_blocking(move || apply(&vault, &template))
        .await
        .map_err(|_| interrupted())?
}

/// The blocking half of [`preview_reorganize`], which is also the testable one.
///
/// # Errors
///
/// See [`preview_reorganize`].
pub fn preview(vault: &str, template: &str) -> Result<ReorganizePreview, CommandError> {
    let pattern = PathTemplate::parse(template)?;
    let root = VaultRoot::open(Path::new(vault))?;
    let loaded = VaultLoader::new(store(&root)).load()?;
    let plan = VaultReorganize::new(store(&root)).plan(&loaded, &pattern)?;

    Ok(ReorganizePreview {
        moves: plan.moves().iter().map(row_for).collect(),
        blocked: plan.blocked().iter().map(blocked_row).collect(),
        unchanged: plan.unchanged(),
    })
}

/// The blocking half of [`apply_reorganize`], against this device's real state directory.
///
/// # Errors
///
/// See [`apply_reorganize`], plus [`CoreError::HomeDirectoryUnavailable`] if `HOME` is not
/// set.
///
/// [`CoreError::HomeDirectoryUnavailable`]: lecture_core::CoreError::HomeDirectoryUnavailable
pub fn apply(vault: &str, template: &str) -> Result<ReorganizeResult, CommandError> {
    let home = std::env::var_os("HOME").ok_or(CoreError::HomeDirectoryUnavailable)?;

    apply_under(&state_base(Path::new(&home)), vault, template)
}

/// The same work, with the per-device state kept under `base`.
///
/// Split exactly as [`DeviceStateStore::for_vault`] and [`DeviceStateStore::under`] are
/// split, and for the same reason: a test must be able to run this without writing into the
/// real `~/Library/Application Support`, which `CLAUDE.md` §1.9 puts out of bounds.
///
/// # Errors
///
/// See [`apply_reorganize`].
pub fn apply_under(
    base: &Path,
    vault: &str,
    template: &str,
) -> Result<ReorganizeResult, CommandError> {
    let pattern = PathTemplate::parse(template)?;
    let root = VaultRoot::open(Path::new(vault))?;
    let loaded = VaultLoader::new(store(&root)).load()?;

    let reorganize = VaultReorganize::new(store(&root));
    let plan = reorganize.plan(&loaded, &pattern)?;
    let outcome = reorganize.apply(&plan)?;

    // §1.4: failure must never lose work, and a remembered page is work. The device state
    // is keyed by lecture path, so it has to be told where each lecture went.
    let positions_lost = follow_the_moves(base, &root, &outcome.moved);

    Ok(ReorganizeResult {
        moved: outcome
            .moved
            .iter()
            .map(|(from, to)| MoveRow {
                from: from.to_string(),
                to: to.to_string(),
            })
            .collect(),
        blocked: plan.blocked().iter().map(blocked_row).collect(),
        complete: outcome.is_complete(),
        stopped_by: outcome.stopped_by.map(Into::into),
        positions_lost,
    })
}

/// Moves each lecture's remembered reading position to its new folder, reporting rather
/// than raising a failure to do so.
///
/// The failure is returned instead of propagated, and the signature is what makes that
/// binding: by the time this runs the folders have moved, so a `?` here would answer a
/// reorganize that happened with an error that says it did not — §1.1, and the worse half
/// of it, because the person would go looking for lectures the UI said had not moved.
///
/// Not swallowed either. It is logged on the way past and handed back as
/// [`ReorganizeResult::positions_lost`], because §1.4 counts the page someone had open as
/// work even though it is only a scroll position.
fn follow_the_moves(
    base: &Path,
    root: &VaultRoot,
    moved: &[(RelativePath, RelativePath)],
) -> Option<CommandError> {
    if moved.is_empty() {
        return None;
    }

    match relocate_positions(base, root, moved) {
        Ok(()) => None,
        Err(error) => {
            logging::failure("move a lecture's reading position", &error);

            Some(error.into())
        }
    }
}

/// The fallible half, split out so [`follow_the_moves`] has one place to catch.
fn relocate_positions(
    base: &Path,
    root: &VaultRoot,
    moved: &[(RelativePath, RelativePath)],
) -> Result<(), CoreError> {
    let device = DeviceStateStore::under(base, root)?;
    let mut state = device.load();

    for (from, to) in moved {
        state.relocate(from, to);
    }

    device.save(&state)
}

/// A manifest store over `root`.
///
/// Built per user rather than shared, because a `ManifestStore` is a handle over a path and
/// not a resource worth passing around -- and it is not `Clone`, which says the same thing.
fn store(root: &VaultRoot) -> ManifestStore<SystemClock> {
    ManifestStore::new(AtomicFsStorage::new(root.clone()), SystemClock)
}

fn row_for(step: &lecture_core::Move) -> MoveRow {
    MoveRow {
        from: step.from.to_string(),
        to: step.to.to_string(),
    }
}

fn blocked_row(blocked: &lecture_core::BlockedLecture) -> BlockedRow {
    BlockedRow {
        directory: blocked.at.to_string(),
        wanted: blocked.wanted.clone(),
        reason: name_of(blocked.reason),
        remediation: blocked.reason.remediation(),
    }
}

/// The one thing a cancelled worker can mean here.
const fn interrupted() -> CommandError {
    CommandError {
        code: "ERR_REORGANIZE_INTERRUPTED",
        remediation: "The reorganize stopped before it finished. Your lectures are all \
                      still there; open the vault again to see where they are.",
    }
}
