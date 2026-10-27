//! A validated zoom factor.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// The smallest zoom the viewer will restore.
///
/// Fit Width on a wide landscape slide can legitimately land below `0.5`, so the floor is
/// generous. It exists to stop a corrupt or hand-edited file restoring a zoom of zero,
/// which would render a page as nothing and look like a lost document.
pub const MIN_ZOOM: f64 = 0.1;

/// The largest zoom the viewer will restore.
///
/// Well past any useful reading zoom. Like the floor, this is a guard against a nonsense
/// stored value rather than a limit anyone will meet.
pub const MAX_ZOOM: f64 = 16.0;

/// How far the viewer is zoomed in, where `1.0` is the page's natural size.
///
/// A scale factor, deliberately **not** normalised to `[0.0, 1.0]` like the annotation
/// geometry: those are positions on a page, which have a meaningful maximum, whereas this
/// is a multiplier that has no natural upper bound and only needs sane limits.
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(try_from = "f64", into = "f64")]
pub struct Zoom(f64);

impl TryFrom<f64> for Zoom {
    type Error = CoreError;

    fn try_from(value: f64) -> Result<Self, Self::Error> {
        Self::new(value)
    }
}

impl From<Zoom> for f64 {
    fn from(zoom: Zoom) -> Self {
        zoom.0
    }
}

impl Default for Zoom {
    fn default() -> Self {
        Self::natural()
    }
}

impl Zoom {
    /// The page at its natural size.
    #[must_use]
    pub fn natural() -> Self {
        Self(1.0)
    }

    /// A zoom factor, if it is finite and within the supported range.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidZoom`] for a value that is not finite or falls outside
    /// [`MIN_ZOOM`]`..=`[`MAX_ZOOM`].
    pub fn new(value: f64) -> Result<Self, CoreError> {
        if !value.is_finite() {
            return Err(CoreError::InvalidZoom {
                value: format!("{value}"),
            });
        }

        if !(MIN_ZOOM..=MAX_ZOOM).contains(&value) {
            return Err(CoreError::InvalidZoom {
                value: format!("{value}"),
            });
        }

        Ok(Self(value))
    }

    /// The factor, where `1.0` is natural size.
    #[must_use]
    pub fn factor(self) -> f64 {
        self.0
    }
}
