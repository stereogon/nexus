//! Projecting `sequence` onto the `NN-` folder prefixes that make a vault readable in
//! Finder.
//!
//! # `sequence` is the order; the prefix is a picture of it
//!
//! Nothing here is consulted to decide what order lectures are in — `sequence` already
//! settled that. This exists so that opening the vault in Finder, or in the Files app on
//! an iPad, shows the same order the app shows. When the two disagree, `sequence` wins
//! and the prefixes are rewritten to match, never the other way round.
//!
//! # Ordering the renames, and why "tail-first" is not enough
//!
//! `CLAUDE.md` §3 used to say renumbering renames tail-first so no rename collides. That
//! holds for a pure shift — insert at the front and every folder moves up one — but not
//! in general.
//!
//! The thing that makes most reorders easy is that the **stem is part of the name**:
//! renaming `01-intro` to `02-intro` does not touch `02-raft`, so folders with differing
//! stems mostly cannot collide, whatever order they are done in. The planner exploits
//! that and spends no temporary name on them.
//!
//! Siblings that *share* a stem are the hard case. `01-lecture`, `02-lecture`,
//! `03-lecture` reorder as a pure permutation of their prefixes, and a permutation can
//! contain a **cycle**: drag the third to the front and every target is held by another
//! member of the cycle, so whichever rename happens first, its target is occupied. No
//! ordering fixes that, tail-first included.
//!
//! So the plan does two things. It emits a rename only when its target is actually free,
//! which handles every acyclic case with no temporary name at all and is strictly more
//! general than tail-first. And when only cycles remain, it breaks one with a single
//! temporary name, which is the minimum a cycle can be done in.
//!
//! # It is safe to interrupt, so it is not transactional
//!
//! A half-finished renumber leaves the vault showing the correct order, because
//! `sequence` was never touched — only the picture of it is briefly wrong, and re-running
//! completes the job. That property is worth more than a transaction here: it falls out of
//! the locked decision rather than being bolted on, and it needs no journal to recover.
//!
//! What the plan will never do is rename into a name something else already holds.
//! `fs::rename` replaces an existing file silently on POSIX, so a target occupied by
//! anything that is not part of this renumber is reported and skipped.

mod name;
mod plan;

use std::collections::HashSet;

use crate::error::CoreError;
use crate::ports::DirectoryEntry;

pub use name::{RENUMBERING_SUFFIX, position_width, positioned_name, stem_of, temporary_name};
pub use plan::{BlockedFolder, OrderedFolder, Rename, RenumberBlock, RenumberPlan};

/// Plans the renames that make `folders`' prefixes match their `sequence`.
///
/// `existing` is everything currently in the parent directory — including files and
/// folders that are not lectures, because those can occupy a name a lecture needs and
/// must not be replaced.
///
/// # Errors
///
/// Returns [`CoreError`] only if a temporary name cannot be built for a cycle, which is
/// itself reported as a blocked folder rather than failing; a returned error means the
/// plan could not be computed at all.
pub fn plan_renumber(
    folders: &[OrderedFolder],
    existing: &[DirectoryEntry],
) -> Result<RenumberPlan, CoreError> {
    let mut plan = RenumberPlan::default();

    let mut sorted: Vec<&OrderedFolder> = folders.iter().collect();
    sorted.sort_by(|a, b| {
        a.sequence()
            .as_str()
            .cmp(b.sequence().as_str())
            // Two lectures sharing a sequence is a conflict to resolve elsewhere; here it
            // only needs to produce the same plan twice.
            .then_with(|| a.name().as_str().cmp(b.name().as_str()))
    });

    let mut occupied: HashSet<String> = existing.iter().map(|e| e.name.clone()).collect();
    let mut pending = Vec::new();

    for (offset, folder) in sorted.iter().enumerate() {
        let position = offset + 1;
        let stem = stem_of(folder.name().as_str());

        match positioned_name(position, sorted.len(), stem) {
            Ok(target) if &target != folder.name() => pending.push(Rename {
                from: folder.name().clone(),
                to: target,
            }),
            Ok(_) => {}
            Err(_) => plan.record_blocked(BlockedFolder {
                name: folder.name().clone(),
                wanted: format!("{position}-{stem}"),
                reason: RenumberBlock::NameTooLong,
            }),
        }
    }

    while !pending.is_empty() {
        let (ready, waiting): (Vec<Rename>, Vec<Rename>) = pending
            .into_iter()
            .partition(|rename| !occupied.contains(rename.to.as_str()));

        if ready.is_empty() {
            pending = break_deadlock(waiting, &mut occupied, &mut plan);
            continue;
        }

        for rename in ready {
            occupied.remove(rename.from.as_str());
            occupied.insert(rename.to.as_str().to_owned());
            plan.record_rename(rename);
        }

        pending = waiting;
    }

    Ok(plan)
}

/// Resolves a round where no rename's target is free.
///
/// Two causes, and they are told apart rather than lumped together. A target held by
/// something that is not moving can never free up, so that folder is reported and left
/// alone. A target held by another folder that is also waiting is a cycle, and one
/// temporary name breaks it.
fn break_deadlock(
    waiting: Vec<Rename>,
    occupied: &mut HashSet<String>,
    plan: &mut RenumberPlan,
) -> Vec<Rename> {
    let movers: HashSet<String> = waiting
        .iter()
        .map(|rename| rename.from.as_str().to_owned())
        .collect();

    let (blocked, cyclic): (Vec<Rename>, Vec<Rename>) = waiting
        .into_iter()
        .partition(|rename| !movers.contains(rename.to.as_str()));

    if !blocked.is_empty() {
        for rename in blocked {
            plan.record_blocked(BlockedFolder {
                name: rename.from,
                wanted: rename.to.as_str().to_owned(),
                reason: RenumberBlock::NameTaken,
            });
        }

        return cyclic;
    }

    // Every remaining target is held by another mover: a cycle. Move one aside.
    let mut remaining = cyclic;
    let Some(first) = remaining.first().cloned() else {
        return remaining;
    };

    let Ok(temporary) = temporary_name(&first.from, &|candidate| occupied.contains(candidate))
    else {
        // Only reachable for a name already at the length limit, where adding a suffix
        // would not fit. Reported rather than shortened: silently truncating someone's
        // folder name would be a startling thing for a tidying operation to do.
        plan.record_blocked(BlockedFolder {
            name: first.from.clone(),
            wanted: first.to.as_str().to_owned(),
            reason: RenumberBlock::NameTooLong,
        });
        remaining.retain(|rename| rename.from != first.from);

        return remaining;
    };

    occupied.remove(first.from.as_str());
    occupied.insert(temporary.as_str().to_owned());
    plan.record_rename(Rename {
        from: first.from.clone(),
        to: temporary.clone(),
    });

    // Still needs its real name; it simply waits under a different one now.
    if let Some(entry) = remaining.first_mut() {
        entry.from = temporary;
    }

    remaining
}
