//! The pieces a renumber is described in: what is being ordered, what moves, and what
//! could not be placed.
//!
//! Separated from the algorithm next door so that reading "what is a plan" does not mean
//! reading how one is computed. The one method with real logic is
//! [`RenumberPlan::net_moves`], which exists because a caller cannot recover where a
//! folder ended up from the rename list alone once a cycle has been broken.

use std::collections::HashSet;

use crate::domain::{OrderKey, Slug};

/// A lecture folder and the key that decides where it sits.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrderedFolder {
    name: Slug,
    sequence: OrderKey,
}

impl OrderedFolder {
    /// A folder named `name`, ordered by `sequence`.
    #[must_use]
    pub fn new(name: Slug, sequence: OrderKey) -> Self {
        Self { name, sequence }
    }

    /// The folder's current name.
    #[must_use]
    pub fn name(&self) -> &Slug {
        &self.name
    }

    /// The key that orders it.
    #[must_use]
    pub fn sequence(&self) -> &OrderKey {
        &self.sequence
    }
}

/// One directory rename, both names being siblings in the same parent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rename {
    /// The name as it is now.
    pub from: Slug,
    /// The name it should have.
    pub to: Slug,
}

/// Why a folder was left out of a renumber.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenumberBlock {
    /// Something that is not part of this renumber already holds the name it needs.
    NameTaken,
    /// The name it needs is too long to use.
    NameTooLong,
}

impl RenumberBlock {
    /// A sentence to show a person, saying what to do about it.
    #[must_use]
    pub fn remediation(self) -> &'static str {
        match self {
            Self::NameTaken => {
                "Another file or folder already has the name this lecture needs, so it \
                 was left as it is rather than replacing it. Renaming or moving that \
                 other item and tidying again will finish the job. Nothing was changed."
            }
            Self::NameTooLong => {
                "This lecture's folder name is too long to add a number to, so it was \
                 left as it is. Shortening the folder name will let it be numbered. \
                 Nothing was changed."
            }
        }
    }
}

/// A folder a renumber could not place, with a reason to show.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockedFolder {
    /// The folder that stays where it is.
    pub name: Slug,
    /// The name it wanted, for the message.
    pub wanted: String,
    /// Why it did not get it.
    pub reason: RenumberBlock,
}

/// Renames to apply in order, and the folders that could not be placed.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RenumberPlan {
    renames: Vec<Rename>,
    blocked: Vec<BlockedFolder>,
}

impl RenumberPlan {
    /// The renames, which must be applied in this order.
    #[must_use]
    pub fn renames(&self) -> &[Rename] {
        &self.renames
    }

    /// Folders left as they are, each with a reason.
    #[must_use]
    pub fn blocked(&self) -> &[BlockedFolder] {
        &self.blocked
    }

    /// Whether the prefixes already match `sequence`.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.renames.is_empty()
    }

    /// How many renames it will take.
    #[must_use]
    pub fn len(&self) -> usize {
        self.renames.len()
    }

    /// Appends a rename, which the caller has already checked is safe to apply here.
    pub(super) fn record_rename(&mut self, rename: Rename) {
        self.renames.push(rename);
    }

    /// Records a folder that stays where it is, with the reason to show for it.
    pub(super) fn record_blocked(&mut self, blocked: BlockedFolder) {
        self.blocked.push(blocked);
    }

    /// Where each folder ends up, ignoring any temporary name on the way.
    ///
    /// Needed because anything keyed by a lecture's path — per-device view state, most
    /// obviously — has to be moved with it, and a caller cannot work that out from the
    /// rename list alone once a cycle has been broken by a temporary name.
    #[must_use]
    pub fn net_moves(&self) -> Vec<(Slug, Slug)> {
        let intermediate: HashSet<&str> = self.renames.iter().map(|r| r.to.as_str()).collect();

        self.renames
            .iter()
            .filter(|rename| !intermediate.contains(rename.from.as_str()))
            .map(|rename| (rename.from.clone(), self.final_name(&rename.to)))
            .filter(|(from, to)| from != to)
            .collect()
    }

    /// Follows a chain of renames to the name it ends at.
    fn final_name(&self, after: &Slug) -> Slug {
        let mut current = after.clone();

        // Bounded by the number of renames: each is followed at most once, because a
        // name is only ever renamed away from one time.
        for _ in 0..self.renames.len() {
            match self.renames.iter().find(|r| r.from == current) {
                Some(next) => current = next.to.clone(),
                None => break,
            }
        }

        current
    }
}
