//! A rectangle on a page, stored independently of any viewport.
//!
//! Every coordinate is a fraction of the **unscaled** page's width or height, so the
//! same stored value lands on the same ink at any zoom level, on any display, and on a
//! future iPad. Raw pixels never reach disk — see `CLAUDE.md` §3.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// Slack allowed when checking that a rectangle fits inside the page.
///
/// A text-selection rectangle arrives from PDF.js as the product of several
/// floating-point transforms, so a rectangle that mathematically ends exactly at the
/// page edge can arrive as `1.0000000000000002`. Rejecting that would silently drop
/// legitimate highlights of the last word on a line. This tolerance is far below one
/// device pixel on any real page, so it cannot mask a genuine positioning bug.
const BOUNDS_TOLERANCE: f64 = 1e-6;

/// A viewport-independent rectangle, validated on construction.
///
/// Construct with [`NormalizedRect::new`]. There is no way to build an invalid value:
/// deserialization routes through the same check, so a corrupted or hand-edited
/// `annotations.json` cannot produce a rectangle that renders in the wrong place.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "RawRect")]
pub struct NormalizedRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// The on-disk shape, used only as a deserialization staging area.
///
/// This exists so that `#[derive(Deserialize)]` cannot hand out an unvalidated
/// `NormalizedRect`. Deriving `Deserialize` directly on the real type would let any
/// JSON file bypass [`NormalizedRect::new`] entirely — the invariant would hold for
/// code paths and not for files, which is the half that matters.
#[derive(Deserialize)]
struct RawRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl TryFrom<RawRect> for NormalizedRect {
    type Error = CoreError;

    fn try_from(raw: RawRect) -> Result<Self, Self::Error> {
        Self::new(raw.x, raw.y, raw.width, raw.height)
    }
}

impl NormalizedRect {
    /// Builds a rectangle, rejecting anything that could not describe a real region.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidCoordinate`] if any component is `NaN` or infinite,
    /// if `x` or `y` falls outside `[0.0, 1.0]`, or if `width` or `height` is not
    /// strictly positive. A zero-area rectangle is rejected because it would persist as
    /// an annotation that can never be seen or clicked — a silent data bug rather than
    /// a visible one.
    ///
    /// Returns [`CoreError::RectOutOfBounds`] if the rectangle starts inside the page
    /// but extends past its right or bottom edge.
    pub fn new(x: f64, y: f64, width: f64, height: f64) -> Result<Self, CoreError> {
        Self::check_unit_interval("x", x)?;
        Self::check_unit_interval("y", y)?;
        Self::check_positive_extent("width", width)?;
        Self::check_positive_extent("height", height)?;

        let right = x + width;
        if right > 1.0 + BOUNDS_TOLERANCE {
            return Err(CoreError::RectOutOfBounds {
                field: "x + width",
                reach: right,
            });
        }

        let bottom = y + height;
        if bottom > 1.0 + BOUNDS_TOLERANCE {
            return Err(CoreError::RectOutOfBounds {
                field: "y + height",
                reach: bottom,
            });
        }

        Ok(Self {
            x,
            y,
            width,
            height,
        })
    }

    fn check_unit_interval(field: &'static str, value: f64) -> Result<(), CoreError> {
        if value.is_finite() && (0.0..=1.0).contains(&value) {
            Ok(())
        } else {
            Err(CoreError::InvalidCoordinate { field, value })
        }
    }

    fn check_positive_extent(field: &'static str, value: f64) -> Result<(), CoreError> {
        if value.is_finite() && value > 0.0 && value <= 1.0 {
            Ok(())
        } else {
            Err(CoreError::InvalidCoordinate { field, value })
        }
    }

    /// Distance from the page's left edge, as a fraction of page width.
    #[must_use]
    pub const fn x(&self) -> f64 {
        self.x
    }

    /// Distance from the page's top edge, as a fraction of page height.
    #[must_use]
    pub const fn y(&self) -> f64 {
        self.y
    }

    /// Width as a fraction of page width. Always strictly positive.
    #[must_use]
    pub const fn width(&self) -> f64 {
        self.width
    }

    /// Height as a fraction of page height. Always strictly positive.
    #[must_use]
    pub const fn height(&self) -> f64 {
        self.height
    }

    /// The smallest rectangle covering all of `rects`.
    ///
    /// Used for the box a deep link centres on. It is **derived rather than stored**:
    /// the spec's example keeps both `rects` and a `boundingRect` in the file, which is
    /// two sources of one truth and invites them to disagree after a hand-edit or a
    /// partial write. Computing it costs nothing and cannot drift.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidCoordinate`] if `rects` is empty, since there is no
    /// such thing as the bounding box of nothing.
    pub fn bounding(rects: &[Self]) -> Result<Self, CoreError> {
        let Some(first) = rects.first() else {
            return Err(CoreError::InvalidCoordinate {
                field: "rects",
                value: 0.0,
            });
        };

        let mut left = first.x;
        let mut top = first.y;
        let mut right = first.right();
        let mut bottom = first.bottom();

        for rect in rects.iter().skip(1) {
            left = left.min(rect.x);
            top = top.min(rect.y);
            right = right.max(rect.right());
            bottom = bottom.max(rect.bottom());
        }

        Self::new(left, top, right - left, bottom - top)
    }

    /// Position of the right edge, as a fraction of page width.
    #[must_use]
    pub fn right(&self) -> f64 {
        self.x + self.width
    }

    /// Position of the bottom edge, as a fraction of page height.
    #[must_use]
    pub fn bottom(&self) -> f64 {
        self.y + self.height
    }
}
