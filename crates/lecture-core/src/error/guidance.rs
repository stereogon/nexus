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
use crate::domain::fingerprint_hex;

use wording::{
    ALIAS_REFUSED, CONVERSION_DID_NOT_PRODUCE_A_PDF, CONVERSION_STUCK, CONVERTER_NOT_PERMITTED,
    DATE_UNREADABLE, FILE_OPERATION_ABANDONED, FINGERPRINT_UNREADABLE, FORMAT_NOT_IMPORTABLE,
    HIGHLIGHT_DUPLICATE_ID, HIGHLIGHT_IMPOSSIBLE_PAGE, HIGHLIGHT_POSITION, HIGHLIGHT_UNREADABLE,
    HOME_UNAVAILABLE, LOCATION_OUTSIDE_VAULT, LOCATION_TOO_DEEP, LOCATION_UNUSABLE,
    LOG_UNAVAILABLE, MANIFEST_INCONSISTENT, NAME_TAKEN, NAME_UNUSABLE, POSITION_UNAVAILABLE,
    POSITION_UNREADABLE, READING_PLACE_LOST, STORED_FILE_UNREADABLE, UNRECOGNISED_SCHEMA_VERSION,
    VAULT_UNOPENABLE,
};

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
            Self::NameAlreadyTaken { .. } => "ERR_NAME_ALREADY_TAKEN",
            Self::LoggingUnavailable { .. } => "ERR_LOGGING_UNAVAILABLE",
            Self::HomeDirectoryUnavailable => "ERR_HOME_DIRECTORY_UNAVAILABLE",
            Self::UnsupportedDocumentFormat { .. } => "ERR_UNSUPPORTED_DOCUMENT_FORMAT",
            Self::ConversionFailed { .. } => "ERR_CONVERSION_FAILED",
            Self::ConverterNotPermitted { .. } => "ERR_CONVERTER_NOT_PERMITTED",
            Self::ConversionNotPossible { .. } => "ERR_CONVERSION_NOT_POSSIBLE",
            Self::InvalidFingerprint { .. } => "ERR_INVALID_FINGERPRINT",
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

    /// A stable, non-reversible reference to this exact failure, for the log.
    ///
    /// `CLAUDE.md` §4 allows codes and timings into the log and nothing a person typed or
    /// named. That rules out the `Display` text, which is the useful part for a developer
    /// and is exactly the problem: it interpolates paths, and a path contains folder
    /// names, which contain course and lecture titles.
    ///
    /// Dropping the detail entirely would leave a log that cannot tell "the same file
    /// failed twice" from "two different files failed once", which is most of what a log
    /// is read for. So the detail is replaced by a fingerprint of it: enough to
    /// correlate, nothing to read, and not reversible.
    ///
    /// Changing an error's wording changes its digest, so digests correlate within a
    /// build rather than across versions. That is the right trade against the
    /// alternative, which is a redaction rule per variant that someone eventually forgets
    /// to add for a new one.
    #[must_use]
    pub fn log_digest(&self) -> String {
        fingerprint_hex(self.to_string().as_bytes())
    }

    /// One plain sentence telling the person what to do about it.
    ///
    /// Never blames them, never names an internal symbol, and always suggests a next
    /// step — even when that step is only "report this".
    #[must_use]
    pub const fn remediation(&self) -> &'static str {
        match self {
            Self::InvalidCoordinate { .. } | Self::RectOutOfBounds { .. } => HIGHLIGHT_POSITION,
            Self::InvalidAnnotation { .. } => HIGHLIGHT_UNREADABLE,
            Self::DuplicateAnnotationId { .. } => HIGHLIGHT_DUPLICATE_ID,
            Self::InvalidPageNumber { .. } => HIGHLIGHT_IMPOSSIBLE_PAGE,
            Self::InvalidManifest { .. } => MANIFEST_INCONSISTENT,
            Self::StoredFileUnreadable { .. } => STORED_FILE_UNREADABLE,
            Self::SchemaVersionUnsupported { .. } => UNRECOGNISED_SCHEMA_VERSION,
            Self::InvalidTimestamp { .. } => DATE_UNREADABLE,
            Self::InvalidName { .. } => NAME_UNUSABLE,
            Self::NameAlreadyTaken { .. } => NAME_TAKEN,
            Self::InvalidRelativePath { .. } => LOCATION_UNUSABLE,
            Self::RelativePathTooDeep { .. } => LOCATION_TOO_DEEP,
            Self::VaultRootUnusable { .. } => VAULT_UNOPENABLE,
            Self::SymlinkRefused { .. } => ALIAS_REFUSED,
            Self::PathEscapesVault { .. } => LOCATION_OUTSIDE_VAULT,
            Self::Io { .. } => FILE_OPERATION_ABANDONED,
            Self::LoggingUnavailable { .. } => LOG_UNAVAILABLE,
            Self::HomeDirectoryUnavailable => HOME_UNAVAILABLE,
            Self::UnsupportedDocumentFormat { .. } => FORMAT_NOT_IMPORTABLE,
            Self::ConversionFailed { .. } => CONVERSION_DID_NOT_PRODUCE_A_PDF,
            Self::ConverterNotPermitted { .. } => CONVERTER_NOT_PERMITTED,
            Self::ConversionNotPossible { .. } => CONVERSION_STUCK,
            Self::InvalidFingerprint { .. } => FINGERPRINT_UNREADABLE,
            Self::InvalidZoom { .. } | Self::InvalidPageOffset { .. } => READING_PLACE_LOST,
            Self::InvalidOrderKey { .. } => POSITION_UNREADABLE,
            Self::OrderKeysNotAscending { .. } | Self::OrderSpaceExhausted { .. } => {
                POSITION_UNAVAILABLE
            }
        }
    }
}

/// The sentences themselves, named so the whole set can be read at a glance.
///
/// Separated from the match above because the two are reviewed for different things: the
/// match is checked for *completeness*, which the compiler enforces, and these are
/// checked for *tone* — §1.4's tired student the night before an exam. Naming them also
/// makes a shared message explicit rather than a coincidence of two arms holding the same
/// prose.
///
/// Every one says what happened, what is safe, and what to do next.
mod wording {
    pub(super) const HIGHLIGHT_POSITION: &str = "This highlight's position could not be read, so it was left out rather than \
         drawn in the wrong place. Your notes and the rest of your highlights are \
         untouched. If you edited annotations.json by hand, a backup is beside it.";

    pub(super) const HIGHLIGHT_UNREADABLE: &str = "One highlight could not be read, so it was left out rather than drawn in the \
         wrong place. Your notes and your other highlights are untouched, and a backup \
         of the file is beside it.";

    pub(super) const HIGHLIGHT_DUPLICATE_ID: &str = "Two highlights in this lecture share an identifier, so a link in your notes \
         could point at either. Nothing was deleted, and a backup is beside the file.";

    pub(super) const HIGHLIGHT_IMPOSSIBLE_PAGE: &str = "A highlight recorded a page that cannot exist, so it was left out rather than \
         drawn on the wrong page. Nothing was deleted, and a backup is beside the file.";

    pub(super) const MANIFEST_INCONSISTENT: &str = "This lecture's details contradict each other, so it was left alone rather than \
         loaded wrongly. Nothing was deleted. The message above says which detail does \
         not add up.";

    pub(super) const STORED_FILE_UNREADABLE: &str = "That file could not be loaded, and nothing on disk has been changed. The \
         message above says what went wrong and where a copy of the file was kept, which \
         you can open in any text editor.";

    pub(super) const UNRECOGNISED_SCHEMA_VERSION: &str = "Nexus does not recognise the version this file was saved with, so it has been \
         left completely untouched rather than rewritten. If it was written by a newer \
         version of Nexus, updating will open it normally.";

    pub(super) const DATE_UNREADABLE: &str = "A date recorded in this lecture could not be read, so it has been left out \
         rather than shown wrongly. Nothing was deleted. If you edited a file by hand, a \
         backup is beside it.";

    pub(super) const NAME_UNUSABLE: &str = "That name cannot be used for a folder on disk. Nothing was created or renamed. \
         Try a shorter name, or one without punctuation such as slashes or colons.";

    pub(super) const NAME_TAKEN: &str = "Something already has the name this folder needed, so it was left where it is \
         rather than replacing it. Nothing was changed or deleted.";

    pub(super) const LOCATION_UNUSABLE: &str = "That location cannot be used inside your vault. Nothing was created or moved. \
         Choose a folder inside the vault and try again.";

    pub(super) const LOCATION_TOO_DEEP: &str = "That folder sits more than five levels deep inside your vault, which is further \
         than Nexus will follow. Nothing was moved. Drag it nearer the top of the vault, \
         then try again.";

    pub(super) const VAULT_UNOPENABLE: &str = "Nexus could not open that folder as a vault. Nothing was changed. Check the \
         folder still exists and that you have permission to open it.";

    pub(super) const ALIAS_REFUSED: &str = "That item is an alias pointing somewhere else, and Nexus does not follow \
         aliases inside a vault — following one could put your notes outside the vault \
         without you realising. Nothing was changed. Move the real folder into your \
         vault instead.";

    pub(super) const LOCATION_OUTSIDE_VAULT: &str = "That location turned out to sit outside your vault, so Nexus stopped before \
         reading or writing anything. Nothing was changed.";

    pub(super) const FILE_OPERATION_ABANDONED: &str = "A file operation did not finish, so it was abandoned rather than left \
         half-done. Your existing notes and highlights are untouched. Check there is \
         free disk space and that the vault folder is reachable, then try again.";

    pub(super) const LOG_UNAVAILABLE: &str = "Nexus could not start its diagnostic log, so this session will not be recorded. \
         Everything else works normally, and none of your work is affected.";

    pub(super) const HOME_UNAVAILABLE: &str = "Nexus could not find your home folder, so it cannot remember where you were \
         reading. Your vault, notes and highlights are unaffected.";

    pub(super) const FORMAT_NOT_IMPORTABLE: &str = "Nexus imports PDF, PowerPoint and Word documents, and that file is none of \
         them. Nothing was imported or changed, and the file is where you left it. \
         Exporting it as a PDF first will import it fine.";

    pub(super) const CONVERSION_DID_NOT_PRODUCE_A_PDF: &str = "The converter could not turn this document into a PDF, so the lecture is there \
         with its original file and nothing to show yet. Nothing was lost. You can try \
         the conversion again, and the diagnostic log records what the converter said.";

    pub(super) const CONVERTER_NOT_PERMITTED: &str = "macOS will not let Nexus control the app needed to convert this document, so \
         nothing was converted and nothing was changed. Allow it in System Settings → \
         Privacy & Security → Automation, then try the import again. Installing \
         LibreOffice avoids needing the permission at all.";

    pub(super) const CONVERSION_STUCK: &str = "This lecture's conversion could not continue from where it had got to, so it \
         was left exactly as it was. Your original file is still in the lecture folder. \
         Importing the lecture again will start the conversion cleanly.";

    pub(super) const FINGERPRINT_UNREADABLE: &str = "Nexus could not read the record of which document this lecture was built from, \
         so it cannot tell whether that document has changed. Your notes, highlights and \
         the document itself are untouched. Re-importing the lecture will record it again.";

    pub(super) const READING_PLACE_LOST: &str = "The app could not restore where you were last reading, so this lecture opened \
         at the first page. Your notes and highlights are untouched.";

    pub(super) const POSITION_UNREADABLE: &str = "One lecture's saved position could not be read, so it has been sorted to the \
         end rather than hidden. Nothing was deleted. Use Renumber Folders to give it a \
         fresh position.";

    pub(super) const POSITION_UNAVAILABLE: &str = "This lecture could not be slotted into that position. Nothing was moved or \
         lost. Use Renumber Folders to space the list out evenly, then try again.";
}
