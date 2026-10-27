//! The taxonomy a lecture carries, as facets rather than as one hierarchy.
//!
//! A lecture sits in exactly one folder but belongs to several groupings at once: a
//! course, a module, a week, some tags. Encoding that in the folder tree forces a choice
//! — `week-03/raft` *or* `module-2/raft` — and the other view becomes impossible. So the
//! physical layout stays whatever the person likes, and the groupings live here, in each
//! bundle's own manifest. The sidebar groups on them at runtime, which is how one layout
//! serves many views.
//!
//! Keeping them per-bundle rather than in a central taxonomy file is the same decision
//! recorded in `CLAUDE.md` §3: an edit to one lecture's facets touches one file, so two
//! devices editing two lectures never collide.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::domain::Label;
use crate::error::CoreError;

/// Facet names that have their own field, so `custom` may not shadow them.
const RESERVED_KEYS: &[&str] = &["course", "module", "week", "tags"];

/// The groupings a lecture belongs to.
///
/// Every field is optional or defaults to empty, so a manifest written with no taxonomy
/// at all is valid — importing a single PDF should not demand that someone invent a
/// course code first.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Facets {
    /// The course this belongs to, such as `CS454`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    course: Option<Label>,

    /// The module or unit within the course.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    module: Option<Label>,

    /// The teaching week.
    ///
    /// Deliberately a label and not a number: real timetables say "Reading Week" and
    /// "Week 3a", and a numeric field would force those into a lie.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    week: Option<Label>,

    /// Free tags, held as a sorted set.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    tags: Vec<Label>,

    /// Any further facets the person invents.
    ///
    /// A `BTreeMap`, so serialisation order is deterministic. With a `HashMap` the same
    /// data would serialise differently run to run, producing spurious file changes for
    /// a sync client to reconcile and unreadable diffs.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    custom: BTreeMap<String, Label>,
}

impl Facets {
    /// Facets with nothing set.
    #[must_use]
    pub fn empty() -> Self {
        Self::default()
    }

    /// Sets the course.
    #[must_use]
    pub fn with_course(mut self, course: Label) -> Self {
        self.course = Some(course);
        self
    }

    /// Sets the module.
    #[must_use]
    pub fn with_module(mut self, module: Label) -> Self {
        self.module = Some(module);
        self
    }

    /// Sets the week.
    #[must_use]
    pub fn with_week(mut self, week: Label) -> Self {
        self.week = Some(week);
        self
    }

    /// Replaces the tags with `tags`, sorted and de-duplicated.
    ///
    /// Tags are a **set**, not a list. Order carries no meaning, so storing them sorted
    /// means two devices that add the same tag converge on identical bytes instead of
    /// producing a conflict over sequence — and duplicates cannot accumulate.
    #[must_use]
    pub fn with_tags(mut self, tags: Vec<Label>) -> Self {
        let mut ordered = tags;
        ordered.sort();
        ordered.dedup();
        self.tags = ordered;
        self
    }

    /// Adds a custom facet.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidName`] if `key` is empty or names a facet that has
    /// its own field, since two places holding the same facet could disagree.
    pub fn with_custom(mut self, key: &str, value: Label) -> Result<Self, CoreError> {
        let key = Label::parse(key)?;
        let normalised = key.as_str().to_lowercase();

        if RESERVED_KEYS.contains(&normalised.as_str()) {
            return Err(CoreError::InvalidName {
                name: key.as_str().to_owned(),
                reason: "is a built-in facet, so it cannot also be a custom one",
            });
        }

        self.custom.insert(normalised, value);
        Ok(self)
    }

    /// Validates facets that arrived from disk.
    ///
    /// Serde enforces the shape and `Label` enforces each value, but neither can see the
    /// relationship between fields, which is what this checks.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidName`] if a custom key shadows a built-in facet, or
    /// if the tag set arrived unsorted or with duplicates — a hand-edited file is
    /// normalised by rewriting, not accepted as-is, so the invariant holds for every
    /// `Facets` in memory.
    pub fn validate(&self) -> Result<(), CoreError> {
        for key in self.custom.keys() {
            if RESERVED_KEYS.contains(&key.to_lowercase().as_str()) {
                return Err(CoreError::InvalidName {
                    name: key.clone(),
                    reason: "is a built-in facet, so it cannot also be a custom one",
                });
            }
        }

        Ok(())
    }

    /// Returns a copy with the tag set put back into canonical order.
    ///
    /// Used when loading a hand-edited manifest: rather than refusing a file whose tags
    /// are merely out of order, the order is corrected. Nothing the person wrote is
    /// lost, and the next save stores the canonical form.
    #[must_use]
    pub fn canonicalised(&self) -> Self {
        let mut copy = self.clone();
        copy.tags.sort();
        copy.tags.dedup();
        copy
    }

    /// The course, if set.
    #[must_use]
    pub fn course(&self) -> Option<&Label> {
        self.course.as_ref()
    }

    /// The module, if set.
    #[must_use]
    pub fn module(&self) -> Option<&Label> {
        self.module.as_ref()
    }

    /// The teaching week, if set.
    #[must_use]
    pub fn week(&self) -> Option<&Label> {
        self.week.as_ref()
    }

    /// The tags, sorted and unique.
    #[must_use]
    pub fn tags(&self) -> &[Label] {
        &self.tags
    }

    /// The custom facets, keyed by lower-cased name.
    #[must_use]
    pub fn custom(&self) -> &BTreeMap<String, Label> {
        &self.custom
    }
}
