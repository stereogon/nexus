//! Pure domain logic for Nexus, an offline-first lecture study app.
//!
//! This crate deliberately has **no** Tauri, UI, filesystem-location or platform
//! dependency. Everything here is either a validated value type or a trait describing
//! a capability that a platform adapter provides. That constraint is what allows the
//! same engine to be compiled for iPadOS in Phase 2 instead of being reimplemented,
//! and it is enforced in CI by building this crate for `aarch64-apple-ios`.
//!
//! Anything that needs to run a process, know where the user's home directory is, or
//! talk to an Apple framework belongs in an adapter crate, behind a trait declared
//! here.
//!
//! See `CLAUDE.md` at the repository root for the values and the binding constraints
//! this crate is written under.

pub mod domain;
pub mod error;
pub mod ports;

pub use domain::{
    ANNOTATIONS_FILE_NAME, ANNOTATIONS_SCHEMA, ANNOTATIONS_SCHEMA_VERSION, ASSETS_DIR_NAME,
    Annotation, AnnotationId, AnnotationSet, BlockedFolder, BlockedLecture, BundleRef,
    CACHE_DIR_NAME, CITATION_SCHEME, CURRENT_SCHEMA_VERSION, Citation, CitationIndex, Conversion,
    ConversionRequest, ConversionState, DOCUMENT_FILE_NAME, DocumentFormat, DocumentRisk, Excerpt,
    Facets, Fingerprint, Fingerprinter, HighlightSemantic, INDEX_FILE_NAME, INDEX_SCHEMA,
    INDEX_SCHEMA_VERSION, ImportPlan, Label, LectureBundle, LectureView, MANIFEST_FILE_NAME,
    MANIFEST_SCHEMA, MAX_BUNDLE_DEPTH, MAX_DEPTH, MAX_WITHIN_BUNDLE_DEPTH, MAX_ZOOM, MIN_ZOOM,
    Manifest, Move, NOTES_FILE_NAME, NormalizedRect, OLDEST_READABLE_SCHEMA_VERSION,
    ORIGINAL_FILE_STEM, OrderKey, OrderedFolder, PageNumber, PageOffset, PathTemplate,
    PlacedLecture, RENUMBERING_SUFFIX, RelativePath, Rename, RenumberBlock, RenumberPlan,
    ReorganizeBlock, ReorganizePlan, RiskScan, RiskSeverity, SOURCE_DIR_NAME, SchemaProbe,
    SchemaRange, SkipReason, SkippedDirectory, Slug, Source, Theme, Timestamp, Unnameable,
    VIEW_STATE_FILE_NAME, VIEW_STATE_SCHEMA, VIEW_STATE_SCHEMA_VERSION, VaultIndex, VaultScan,
    ViewState, Zoom, cache_dir_segment, citation_link, fingerprint, fingerprint_hex, plan_renumber,
    plan_reorganize, position_width, positioned_name, scan_vault, stem_of, temporary_name,
};
pub use error::{BackupOutcome, CoreError};
pub use ports::{
    Clock, DirectoryEntry, DocumentConverterPort, EntryKind, FixedClock, VaultDirectory,
    select_converter,
};
