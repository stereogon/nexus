//! Filing lectures that already exist according to a [`PathTemplate`].
//!
//! # The dry-run is the feature
//!
//! [`plan_reorganize`] touches nothing and returns what *would* happen. That is not a
//! convenience wrapped around the real operation — it is the operation someone actually
//! wants, because moving a hundred lecture folders on a hunch is how a vault gets lost.
//! Applying the plan is a separate step, and the plan it applies is the same object that
//! was shown.
//!
//! # Ordering the moves
//!
//! The same problem [`plan_renumber`](crate::domain::plan_renumber) solves, and the same
//! answer, for the same reason: **emit a move only when its target is actually free**, and
//! when nothing is free because every target is held by another mover, break the cycle with
//! one temporary name. Two lectures that have been manually swapped are a cycle, and no
//! ordering whatsoever resolves a cycle.
//!
//! The *code* is not shared, and that was a judgement call worth recording. Generalising
//! the renumber planner would mean parameterising it over the name type, the plan it writes
//! into, the reason enum and the temporary-name function — four knobs for sixty lines,
//! which §1.11 calls a pattern larger than the problem. What is shared is the piece that
//! genuinely is the same: [`temporary_name`](crate::domain::temporary_name), which parks a
//! folder under an unused name in its own parent.
//!
//! The two also differ in ways that would leak through any shared abstraction. A renumber
//! permutes siblings in one directory; a reorganize moves whole bundles between
//! directories, so a target's *parents* may not exist yet and occupancy is a question about
//! the whole vault rather than one folder's listing.
//!
//! # Safe to interrupt
//!
//! For the same reason a renumber is: nothing here is a source of truth. Facets and
//! `sequence` live in each bundle's manifest and are untouched, and everything inside a
//! bundle is referenced relatively, so a moved bundle needs no link rewriting — there is a
//! test for that property. A half-finished reorganize leaves every lecture openable, some
//! in their old folder and some in their new one, and re-running finishes the job.
//!
//! What it will never do is move a directory onto a name something else already holds.
//! `fs::rename` replaces silently on POSIX, so an occupied target is reported and skipped.

mod plan;

use std::collections::{HashMap, HashSet};

use crate::domain::{RelativePath, Unnameable, temporary_name};

pub use plan::{BlockedLecture, Move, PlacedLecture, ReorganizeBlock, ReorganizePlan};

/// Plans the moves that file `lectures` where the template says they belong.
///
/// `existing` is every path in the vault that is **not** one of these lectures — other
/// folders, stray files, anything that could occupy a name a lecture needs and must not be
/// written over.
///
/// `unnameable` is the lectures whose target could not be rendered at all, each with the
/// reason: a template of `{course}/{week}-{title}` has nowhere to put a lecture with no
/// week, because the level holding the title names the week too. They stay where they are
/// and are reported. Passing them in rather than leaving them out is the difference between
/// telling someone "give this a week and I can file it" and silently counting it as needing
/// no change — and passing the *reason* is the difference between that and telling them to
/// fix a title that was never the problem.
#[must_use]
pub fn plan_reorganize(
    lectures: &[PlacedLecture],
    unnameable: &[(RelativePath, Unnameable)],
    existing: &[RelativePath],
) -> ReorganizePlan {
    let mut plan = ReorganizePlan::default();

    // Two lectures wanting one folder is settled first and separately. It is not a
    // scheduling problem -- no ordering helps -- and resolving it by letting whichever is
    // planned first win would file one lecture on top of another.
    let shared = shared_targets(lectures);

    let mut pending = Vec::new();

    for lecture in lectures {
        if shared.contains(lecture.target()) {
            plan.record_blocked(BlockedLecture {
                at: lecture.at().clone(),
                wanted: Some(lecture.target().to_string()),
                reason: ReorganizeBlock::SharedTarget,
            });
            continue;
        }

        if lecture.target() == lecture.at() {
            plan.record_unchanged();
            continue;
        }

        pending.push(Move {
            from: lecture.at().clone(),
            to: lecture.target().clone(),
        });
    }

    for (at, reason) in unnameable {
        plan.record_blocked(BlockedLecture {
            at: at.clone(),
            wanted: None,
            reason: match reason {
                Unnameable::FacetsMissing => ReorganizeBlock::PatternNeedsFacets,
                Unnameable::TextUnusable => ReorganizeBlock::NameUnusable,
            },
        });
    }

    // Everything a move must not land on. A mover's own path leaves this set the moment it
    // moves; an unchanged lecture's path never does, because it is staying.
    let mut occupied: HashSet<String> = existing.iter().map(ToString::to_string).collect();
    // An unnameable lecture is staying, so its folder is an obstacle like any other.
    occupied.extend(unnameable.iter().map(|(at, _)| at.to_string()));
    for lecture in lectures {
        if !pending.iter().any(|step| &step.from == lecture.at()) {
            occupied.insert(lecture.at().to_string());
        }
    }
    for step in &pending {
        occupied.insert(step.from.to_string());
    }

    while !pending.is_empty() {
        let (ready, waiting): (Vec<Move>, Vec<Move>) = pending
            .into_iter()
            .partition(|step| !occupied.contains(&step.to.to_string()));

        if ready.is_empty() {
            pending = break_deadlock(waiting, &mut occupied, &mut plan);
            continue;
        }

        for step in ready {
            occupied.remove(&step.from.to_string());
            occupied.insert(step.to.to_string());
            plan.record_move(step);
        }

        pending = waiting;
    }

    plan
}

/// Targets that more than one lecture renders to.
fn shared_targets(lectures: &[PlacedLecture]) -> HashSet<RelativePath> {
    let mut seen: HashMap<&RelativePath, usize> = HashMap::new();

    for lecture in lectures {
        *seen.entry(lecture.target()).or_insert(0) += 1;
    }

    seen.into_iter()
        .filter(|(_, count)| *count > 1)
        .map(|(target, _)| target.clone())
        .collect()
}

/// Resolves a round where no move's target is free.
///
/// Two causes, told apart rather than lumped together. A target held by something that is
/// not moving can never free up, so that lecture is reported and left where it is. A target
/// held by another waiting lecture is a cycle, and one temporary name breaks it.
fn break_deadlock(
    waiting: Vec<Move>,
    occupied: &mut HashSet<String>,
    plan: &mut ReorganizePlan,
) -> Vec<Move> {
    let movers: HashSet<String> = waiting.iter().map(|step| step.from.to_string()).collect();

    let (blocked, cyclic): (Vec<Move>, Vec<Move>) = waiting
        .into_iter()
        .partition(|step| !movers.contains(&step.to.to_string()));

    if !blocked.is_empty() {
        for step in blocked {
            plan.record_blocked(BlockedLecture {
                at: step.from,
                wanted: Some(step.to.to_string()),
                reason: ReorganizeBlock::TargetOccupied,
            });
        }

        return cyclic;
    }

    let mut remaining = cyclic;
    let Some(first) = remaining.first().cloned() else {
        return remaining;
    };

    // Parked in its own parent, so breaking a cycle is a cheap same-directory rename rather
    // than a move across the vault.
    let parent = first.from.parent();
    let taken = |candidate: &str| {
        let path = match &parent {
            Some(parent) => format!("{parent}/{candidate}"),
            None => candidate.to_owned(),
        };

        occupied.contains(&path)
    };

    let aside = temporary_name(first.from.name(), &taken)
        .ok()
        .and_then(|name| match &parent {
            Some(parent) => parent.child(name).ok(),
            None => Some(RelativePath::root_level(name)),
        });

    let Some(aside) = aside else {
        // Only reachable for a name already at the length limit, where a suffix would not
        // fit. Reported rather than shortened: silently truncating someone's folder name
        // would be a startling thing for a tidying operation to do.
        plan.record_blocked(BlockedLecture {
            at: first.from.clone(),
            wanted: Some(first.to.to_string()),
            reason: ReorganizeBlock::CycleUnbreakable,
        });
        remaining.retain(|step| step.from != first.from);

        return remaining;
    };

    occupied.remove(&first.from.to_string());
    occupied.insert(aside.to_string());
    plan.record_move(Move {
        from: first.from.clone(),
        to: aside.clone(),
    });

    // Still needs its real folder; it simply waits under a different name now.
    if let Some(step) = remaining.first_mut() {
        step.from = aside;
    }

    remaining
}
