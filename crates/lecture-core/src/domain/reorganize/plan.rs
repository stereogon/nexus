//! What a reorganize would do, and what it cannot do.

use crate::domain::RelativePath;

/// A lecture as the vault currently holds it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlacedLecture {
    at: RelativePath,
    target: RelativePath,
}

impl PlacedLecture {
    /// A lecture currently at `at` that belongs at `target`.
    #[must_use]
    pub fn new(at: RelativePath, target: RelativePath) -> Self {
        Self { at, target }
    }

    /// Where it is now.
    #[must_use]
    pub const fn at(&self) -> &RelativePath {
        &self.at
    }

    /// Where the template says it belongs.
    #[must_use]
    pub const fn target(&self) -> &RelativePath {
        &self.target
    }
}

/// One directory move.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Move {
    /// Where the directory is now.
    pub from: RelativePath,
    /// Where it goes. Its parents may not exist yet.
    pub to: RelativePath,
}

/// Why a lecture cannot be filed where the template says.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReorganizeBlock {
    /// Something that is not part of this reorganize already holds the target.
    TargetOccupied,
    /// Two or more lectures render to the same folder.
    SharedTarget,
    /// The target could not be named at all.
    NameUnusable,
    /// Part of a cycle that could not be broken.
    CycleUnbreakable,
}

impl ReorganizeBlock {
    /// One plain sentence saying what to do about it.
    ///
    /// Not a `CoreError`: nothing has failed. A blocked lecture is a *finding* in a preview
    /// someone is reading, and the rest of the plan is still perfectly good.
    #[must_use]
    pub const fn remediation(self) -> &'static str {
        match self {
            Self::TargetOccupied => {
                "Something already in the vault has this folder's name, and Nexus will not \
                 write over it. Move or rename that item, then reorganize again."
            }
            Self::SharedTarget => {
                "Two lectures would end up in the same folder, because their titles differ \
                 only in capitalisation or punctuation. Rename one of them, then reorganize \
                 again."
            }
            Self::NameUnusable => {
                "This lecture's title contains nothing usable as a folder name. Give it a \
                 title with at least one letter or number, then reorganize again."
            }
            Self::CycleUnbreakable => {
                "This lecture needs to swap places with another and its name is already at \
                 the length limit, so there is no room for the temporary name that would \
                 make space. Shorten the title, then reorganize again."
            }
        }
    }
}

/// A lecture left where it is, and why.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockedLecture {
    /// Where it still is.
    pub at: RelativePath,
    /// Where it should have gone, rendered for the message.
    pub wanted: String,
    /// What stopped it.
    pub reason: ReorganizeBlock,
}

/// The moves a reorganize would make.
///
/// Produced without touching the disk, which is the point: this *is* the dry-run preview.
/// Applying it is a separate step that walks [`ReorganizePlan::moves`] in order.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ReorganizePlan {
    moves: Vec<Move>,
    blocked: Vec<BlockedLecture>,
    unchanged: usize,
}

impl ReorganizePlan {
    /// The moves, **in an order where each target is free when its turn comes**.
    #[must_use]
    pub fn moves(&self) -> &[Move] {
        &self.moves
    }

    /// Lectures that cannot be filed, with the reason for each.
    #[must_use]
    pub fn blocked(&self) -> &[BlockedLecture] {
        &self.blocked
    }

    /// How many lectures are already where they belong.
    #[must_use]
    pub const fn unchanged(&self) -> usize {
        self.unchanged
    }

    /// Whether running this would change nothing.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.moves.is_empty()
    }

    /// Where each lecture ends up, ignoring the temporary names on the way.
    ///
    /// The same idea as `RenumberPlan::net_moves`: a cycle is carried out with a folder
    /// parked under a temporary name, so the raw move list contains a step that is not
    /// anybody's destination. A preview should show where things land, not the mechanics.
    #[must_use]
    pub fn net_moves(&self) -> Vec<(RelativePath, RelativePath)> {
        let mut net: Vec<(RelativePath, RelativePath)> = Vec::new();

        for step in &self.moves {
            match net.iter_mut().find(|(_, to)| to == &step.from) {
                Some((_, to)) => *to = step.to.clone(),
                None => net.push((step.from.clone(), step.to.clone())),
            }
        }

        net.retain(|(from, to)| from != to);

        net
    }

    pub(super) fn record_move(&mut self, step: Move) {
        self.moves.push(step);
    }

    pub(super) fn record_blocked(&mut self, blocked: BlockedLecture) {
        self.blocked.push(blocked);
    }

    pub(super) fn record_unchanged(&mut self) {
        self.unchanged += 1;
    }
}
