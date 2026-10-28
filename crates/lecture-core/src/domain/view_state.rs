//! Where this device was last looking.
//!
//! # Why this is not in the vault
//!
//! Two reasons, and they point the same way.
//!
//! It cannot be derived from a vault scan, and `CLAUDE.md` §3 makes that the test for
//! what may live in `.nexus/`. Putting it there would have turned "deleting `.nexus/` is
//! safe" into "deleting `.nexus/` costs you your place in every lecture", which is the
//! kind of quiet caveat that makes a guarantee worthless.
//!
//! And it changes constantly. A synced file rewritten on every scroll pushes churn to
//! every device and manufactures the conflicts the per-bundle manifest design exists to
//! avoid. Living outside the vault means no sync client can see it, so there is nothing
//! to conflict over — rather than a file that merely usually does not conflict.
//!
//! Two devices sitting at different pages of the same lecture is therefore *correct*
//! here, not a fault to be reconciled.
//!
//! # Losing it costs a scroll position
//!
//! So it is treated like the index cache rather than like a manifest: a damaged file is
//! discarded and not backed up, because there is no work in it to preserve. The rule is
//! the same one applied throughout — back up what holds work, discard what does not.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::domain::{BundleRef, PageNumber, RelativePath, Zoom};
use crate::error::CoreError;

/// The schema version of a stored view state.
pub const VIEW_STATE_SCHEMA_VERSION: u32 = 1;

/// The file this device keeps its place in.
pub const VIEW_STATE_FILE_NAME: &str = "view-state.json";

/// Where the viewer was within one lecture.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct LectureView {
    page: PageNumber,
    #[serde(default)]
    offset: PageOffset,
    #[serde(default)]
    zoom: Zoom,
}

impl LectureView {
    /// The top of `page`, at natural size.
    #[must_use]
    pub fn at_page(page: PageNumber) -> Self {
        Self {
            page,
            offset: PageOffset::top(),
            zoom: Zoom::natural(),
        }
    }

    /// A position within a lecture.
    #[must_use]
    pub fn new(page: PageNumber, offset: PageOffset, zoom: Zoom) -> Self {
        Self { page, offset, zoom }
    }

    /// Which page was showing.
    #[must_use]
    pub fn page(self) -> PageNumber {
        self.page
    }

    /// How far down that page the viewport sat.
    #[must_use]
    pub fn offset(self) -> PageOffset {
        self.offset
    }

    /// How far zoomed in.
    #[must_use]
    pub fn zoom(self) -> Zoom {
        self.zoom
    }
}

/// How far down a page the viewport sat, as a fraction of the page's height.
///
/// Normalised for the same reason annotation geometry is: a pixel offset is meaningless
/// at a different window size or zoom, and restoring one would put someone in the wrong
/// place on a device with a different screen.
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(try_from = "f64", into = "f64")]
pub struct PageOffset(f64);

impl TryFrom<f64> for PageOffset {
    type Error = CoreError;

    fn try_from(value: f64) -> Result<Self, Self::Error> {
        Self::new(value)
    }
}

impl From<PageOffset> for f64 {
    fn from(offset: PageOffset) -> Self {
        offset.0
    }
}

impl Default for PageOffset {
    fn default() -> Self {
        Self::top()
    }
}

impl PageOffset {
    /// The top of the page.
    #[must_use]
    pub fn top() -> Self {
        Self(0.0)
    }

    /// A fraction down the page.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidPageOffset`] if `value` is not finite or falls outside
    /// `[0.0, 1.0]`.
    pub fn new(value: f64) -> Result<Self, CoreError> {
        if !value.is_finite() || !(0.0..=1.0).contains(&value) {
            return Err(CoreError::InvalidPageOffset {
                value: format!("{value}"),
            });
        }

        Ok(Self(value))
    }

    /// The fraction, where `0.0` is the top of the page.
    #[must_use]
    pub fn fraction(self) -> f64 {
        self.0
    }
}

/// Everything this device remembers about where it was.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "RawViewState", into = "RawViewState")]
pub struct ViewState {
    lectures: BTreeMap<RelativePath, LectureView>,
    last_opened: Option<RelativePath>,
}

/// The on-disk shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RawViewState {
    schema_version: u32,
    #[serde(default)]
    lectures: BTreeMap<RelativePath, LectureView>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_opened: Option<RelativePath>,
}

impl TryFrom<RawViewState> for ViewState {
    type Error = CoreError;

    fn try_from(raw: RawViewState) -> Result<Self, Self::Error> {
        if raw.schema_version != VIEW_STATE_SCHEMA_VERSION {
            return Err(CoreError::SchemaVersionUnsupported {
                file: VIEW_STATE_FILE_NAME,
                found: raw.schema_version,
                supported: VIEW_STATE_SCHEMA_VERSION,
            });
        }

        Ok(Self {
            lectures: raw.lectures,
            last_opened: raw.last_opened,
        })
    }
}

impl From<ViewState> for RawViewState {
    fn from(state: ViewState) -> Self {
        Self {
            schema_version: VIEW_STATE_SCHEMA_VERSION,
            lectures: state.lectures,
            last_opened: state.last_opened,
        }
    }
}

impl ViewState {
    /// A device that has not read anything yet.
    #[must_use]
    pub fn empty() -> Self {
        Self::default()
    }

    /// Where the viewer was in `lecture`, if it has been opened.
    #[must_use]
    pub fn position_in(&self, lecture: &RelativePath) -> Option<LectureView> {
        self.lectures.get(lecture).copied()
    }

    /// Records where the viewer is in `lecture`, and that it is the open one.
    pub fn remember(&mut self, lecture: &RelativePath, view: LectureView) {
        self.lectures.insert(lecture.clone(), view);
        self.last_opened = Some(lecture.clone());
    }

    /// The lecture to reopen on launch, if it still exists.
    #[must_use]
    pub fn last_opened(&self) -> Option<&RelativePath> {
        self.last_opened.as_ref()
    }

    /// How many lectures have a remembered position.
    #[must_use]
    pub fn len(&self) -> usize {
        self.lectures.len()
    }

    /// Whether nothing is remembered.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.lectures.is_empty() && self.last_opened.is_none()
    }

    /// Follows a lecture that has moved, keeping the place in it.
    ///
    /// Positions are keyed by path, so renaming a lecture's folder would otherwise orphan
    /// its entry and `prune_to` would then delete it — meaning a renumber that touched
    /// thirty folders would silently cost someone their place in all thirty. Losing a
    /// scroll position is cheap, but losing it as a side effect of a tidying operation
    /// someone asked for is a bad surprise.
    ///
    /// Does nothing if `from` has no remembered position, which is the common case.
    pub fn relocate(&mut self, from: &RelativePath, to: &RelativePath) {
        if let Some(view) = self.lectures.remove(from) {
            self.lectures.insert(to.clone(), view);
        }

        if self.last_opened.as_ref() == Some(from) {
            self.last_opened = Some(to.clone());
        }
    }

    /// Drops positions for lectures that are no longer in the vault.
    ///
    /// Without this the file grows forever: every lecture ever deleted or renamed would
    /// keep its entry, and a renamed lecture would leave a ghost that never loads. The
    /// vault is the authority on what exists, so pruning against a scan is the only
    /// correct direction.
    ///
    /// A remembered page beyond the end of a *shortened* document is deliberately **not**
    /// pruned here: this type cannot know how many pages a PDF has, and guessing would
    /// mean reading documents to tidy a cache. The viewer clamps when it restores.
    pub fn prune_to(&mut self, lectures: &[BundleRef]) {
        self.lectures
            .retain(|directory, _| lectures.iter().any(|l| l.directory() == directory));

        if self
            .last_opened
            .as_ref()
            .is_some_and(|open| !self.lectures.contains_key(open))
        {
            self.last_opened = None;
        }
    }
}
