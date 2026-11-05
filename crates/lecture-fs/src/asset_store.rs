//! Keeping images pasted into a lecture's notes, in its `assets/` folder.
//!
//! What is kept and what it is called are `lecture_core::ImageFormat` and
//! `asset_file_name`; this writes it through the atomic path like every other file in a
//! bundle. Anything that is not one of the four image formats, or is too large, is turned
//! away as an outcome rather than an error: pasting a PDF or a 300 MB file into a note is
//! something a person did, not something that broke, and it gets a sentence, not a code.

use lecture_core::{
    ASSETS_DIR_NAME, CoreError, ImageFormat, MAX_ASSET_BYTES, RelativePath, Slug, Timestamp,
    asset_file_name,
};
use serde::Serialize;

use crate::storage::AtomicFsStorage;

/// Why an image was not kept.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Refusal {
    /// Not PNG, JPEG, GIF or WebP, judged by its own bytes.
    NotAnImage,
    /// Larger than `MAX_ASSET_BYTES`.
    TooLarge,
}

/// What became of an image.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum AssetSave {
    /// Kept. `path` is relative to the bundle, as the notes refer to it: `assets/<file>`.
    Saved {
        /// Where the notes should point.
        path: String,
    },
    /// Not kept, and why.
    Refused {
        /// The reason, for the window to put in a sentence.
        reason: Refusal,
    },
}

/// Writes images into bundles' `assets/` folders.
pub struct AssetStore {
    storage: AtomicFsStorage,
}

impl AssetStore {
    /// Wraps storage.
    #[must_use]
    pub fn new(storage: AtomicFsStorage) -> Self {
        Self { storage }
    }

    /// Keeps `bytes` as an image of the bundle at `bundle`, named for `at` and its content.
    ///
    /// The same picture pasted twice in the same second is the same file, written once.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] if the folder cannot be made or the write fails, leaving
    /// nothing half-written, and a containment error if `bundle` does not resolve safely.
    pub fn save(
        &self,
        bundle: &RelativePath,
        bytes: &[u8],
        at: &Timestamp,
    ) -> Result<AssetSave, CoreError> {
        if bytes.len() > MAX_ASSET_BYTES {
            return Ok(AssetSave::Refused {
                reason: Refusal::TooLarge,
            });
        }

        let Some(format) = ImageFormat::sniff(bytes) else {
            return Ok(AssetSave::Refused {
                reason: Refusal::NotAnImage,
            });
        };

        let name = asset_file_name(at, bytes, format);
        let folder = assets_dir(bundle)?;
        let file = folder.child(Slug::parse(&name)?)?;

        self.storage.create_dir(&folder)?;

        if !self.storage.exists(&file)? {
            self.storage.write(&file, bytes)?;
        }

        Ok(AssetSave::Saved {
            path: format!("{ASSETS_DIR_NAME}/{name}"),
        })
    }
}

/// `<bundle>/assets`, the one folder whose images the notes may show.
///
/// # Errors
///
/// Returns an error only if the folder name could not be joined, which would mean the
/// bundle path itself is unusable.
pub fn assets_dir(bundle: &RelativePath) -> Result<RelativePath, CoreError> {
    bundle.child(Slug::parse(ASSETS_DIR_NAME)?)
}
