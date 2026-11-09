//! A view state as it is written to disk, and the check made reading it back. Split from
//! `view_state/mod.rs` on 2026-11-09, when the quiet notices took it past the line limit.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use super::{
    LectureView, VIEW_STATE_FILE_NAME, VIEW_STATE_SCHEMA, VIEW_STATE_SCHEMA_VERSION, ViewState,
};
use crate::domain::RelativePath;
use crate::error::CoreError;

/// The on-disk shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct RawViewState {
    schema_version: u32,
    #[serde(default)]
    lectures: BTreeMap<RelativePath, LectureView>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_opened: Option<RelativePath>,
    /// Added 2026-11-09, optional, so a file written before it reads unchanged.
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    quiet_notices: BTreeSet<RelativePath>,
}

impl TryFrom<RawViewState> for ViewState {
    type Error = CoreError;

    fn try_from(raw: RawViewState) -> Result<Self, Self::Error> {
        if raw.schema_version != VIEW_STATE_SCHEMA_VERSION {
            return Err(VIEW_STATE_SCHEMA.reject(VIEW_STATE_FILE_NAME, raw.schema_version));
        }

        Ok(Self {
            lectures: raw.lectures,
            last_opened: raw.last_opened,
            quiet_notices: raw.quiet_notices,
        })
    }
}

impl From<ViewState> for RawViewState {
    fn from(state: ViewState) -> Self {
        Self {
            schema_version: VIEW_STATE_SCHEMA_VERSION,
            lectures: state.lectures,
            last_opened: state.last_opened,
            quiet_notices: state.quiet_notices,
        }
    }
}
