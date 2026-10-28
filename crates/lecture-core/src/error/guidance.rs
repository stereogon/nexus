//! What to tell a person when something fails.
//!
//! Split out of the variant list because the two change for different reasons: a new
//! variant is a new thing that can go wrong, while this file is how it is *said*. Keeping
//! them apart also keeps each under the 300-line limit in `CLAUDE.md` §4.
//!
//! Every message is written for the reader `CLAUDE.md` §1.4 describes: a tired student
//! the night before an exam. So each one says what happened, what is safe, and what to
//! do next — and never promises something that might not be true, which is why the
//! backup outcome is carried in the variant rather than asserted here.

use super::CoreError;

impl CoreError {
    /// A stable identifier for this failure.
    ///
    /// Part of the public contract. Shipped codes are never reworded; a new meaning
    /// gets a new code.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::InvalidCoordinate { .. } | Self::RectOutOfBounds { .. } => {
                "ERR_INVALID_COORDINATE"
            }
            Self::InvalidManifest { .. } => "ERR_INVALID_MANIFEST",
            Self::StoredFileUnreadable { .. } => "ERR_STORED_FILE_UNREADABLE",
            Self::SchemaVersionUnsupported { .. } => "ERR_SCHEMA_VERSION_UNSUPPORTED",
            Self::InvalidAnnotation { .. } => "ERR_INVALID_ANNOTATION",
            Self::DuplicateAnnotationId { .. } => "ERR_DUPLICATE_ANNOTATION_ID",
            Self::InvalidName { .. } => "ERR_INVALID_NAME",
            Self::InvalidPageNumber { .. } => "ERR_INVALID_PAGE_NUMBER",
            Self::HomeDirectoryUnavailable => "ERR_HOME_DIRECTORY_UNAVAILABLE",
            Self::InvalidZoom { .. } => "ERR_INVALID_ZOOM",
            Self::InvalidPageOffset { .. } => "ERR_INVALID_PAGE_OFFSET",
            Self::InvalidTimestamp { .. } => "ERR_INVALID_TIMESTAMP",
            Self::VaultRootUnusable { .. } => "ERR_VAULT_ROOT_UNUSABLE",
            Self::SymlinkRefused { .. } => "ERR_SYMLINK_REFUSED",
            Self::PathEscapesVault { .. } => "ERR_PATH_ESCAPES_VAULT",
            Self::Io { .. } => "ERR_IO",
            Self::InvalidRelativePath { .. } => "ERR_INVALID_RELATIVE_PATH",
            Self::RelativePathTooDeep { .. } => "ERR_RELATIVE_PATH_TOO_DEEP",
            Self::InvalidOrderKey { .. } => "ERR_INVALID_ORDER_KEY",
            Self::OrderKeysNotAscending { .. } => "ERR_ORDER_KEYS_NOT_ASCENDING",
            Self::OrderSpaceExhausted { .. } => "ERR_ORDER_SPACE_EXHAUSTED",
        }
    }

    /// One plain sentence telling the person what to do about it.
    ///
    /// Never blames them, never names an internal symbol, and always suggests a next
    /// step — even when that step is only "report this".
    #[must_use]
    pub const fn remediation(&self) -> &'static str {
        match self {
            Self::InvalidCoordinate { .. } | Self::RectOutOfBounds { .. } => {
                "This highlight's position could not be read, so it was left out rather \
                 than drawn in the wrong place. Your notes and the rest of your \
                 highlights are untouched. If you edited annotations.json by hand, a \
                 backup is beside it."
            }
            Self::InvalidManifest { .. } => {
                "This lecture's details contradict each other, so it was left alone \
                 rather than loaded wrongly. Nothing was deleted. The message above \
                 says which detail does not add up."
            }
            Self::StoredFileUnreadable { .. } => {
                "That file could not be loaded, and nothing on disk has been changed. \
                 The message above says what went wrong and where a copy of the file \
                 was kept, which you can open in any text editor."
            }
            Self::SchemaVersionUnsupported { .. } => {
                "This lecture was saved by a newer version of Nexus. It has been left \
                 completely untouched rather than rewritten, so updating Nexus will \
                 open it normally."
            }
            Self::InvalidName { .. } => {
                "That name cannot be used for a folder on disk. Nothing was created or \
                 renamed. Try a shorter name, or one without punctuation such as \
                 slashes or colons."
            }
            Self::VaultRootUnusable { .. } => {
                "Nexus could not open that folder as a vault. Nothing was changed. Check \
                 the folder still exists and that you have permission to open it."
            }
            Self::SymlinkRefused { .. } => {
                "That item is an alias pointing somewhere else, and Nexus does not \
                 follow aliases inside a vault — following one could put your notes \
                 outside the vault without you realising. Nothing was changed. Move the \
                 real folder into your vault instead."
            }
            Self::PathEscapesVault { .. } => {
                "That location turned out to sit outside your vault, so Nexus stopped \
                 before reading or writing anything. Nothing was changed."
            }
            Self::Io { .. } => {
                "A file operation did not finish, so it was abandoned rather than left \
                 half-done. Your existing notes and highlights are untouched. Check \
                 there is free disk space and that the vault folder is reachable, then \
                 try again."
            }
            Self::InvalidRelativePath { .. } => {
                "That location cannot be used inside your vault. Nothing was created or \
                 moved. Choose a folder inside the vault and try again."
            }
            Self::RelativePathTooDeep { .. } => {
                "That folder sits more than five levels deep inside your vault, which is \
                 further than Nexus will follow. Nothing was moved. Drag it nearer the \
                 top of the vault, then try again."
            }
            Self::InvalidAnnotation { .. } => {
                "One highlight could not be read, so it was left out rather than drawn \
                 in the wrong place. Your notes and your other highlights are \
                 untouched, and a backup of the file is beside it."
            }
            Self::DuplicateAnnotationId { .. } => {
                "Two highlights in this lecture share an identifier, so a link in your \
                 notes could point at either. Nothing was deleted, and a backup is \
                 beside the file."
            }
            Self::InvalidPageNumber { .. } => {
                "A highlight recorded a page that cannot exist, so it was left out \
                 rather than drawn on the wrong page. Nothing was deleted, and a backup \
                 is beside the file."
            }
            Self::HomeDirectoryUnavailable => {
                "Nexus could not find your home folder, so it cannot remember where you \
                 were reading. Your vault, notes and highlights are unaffected."
            }
            Self::InvalidZoom { .. } | Self::InvalidPageOffset { .. } => {
                "The app could not restore where you were last reading, so this lecture \
                 opened at the first page. Your notes and highlights are untouched."
            }
            Self::InvalidTimestamp { .. } => {
                "A date recorded in this lecture could not be read, so it has been left \
                 out rather than shown wrongly. Nothing was deleted. If you edited a \
                 file by hand, a backup is beside it."
            }
            Self::InvalidOrderKey { .. } => {
                "One lecture's saved position could not be read, so it has been sorted \
                 to the end rather than hidden. Nothing was deleted. Use Renumber \
                 Folders to give it a fresh position."
            }
            Self::OrderKeysNotAscending { .. } | Self::OrderSpaceExhausted { .. } => {
                "This lecture could not be slotted into that position. Nothing was \
                 moved or lost. Use Renumber Folders to space the list out evenly, then \
                 try again."
            }
        }
    }
}
