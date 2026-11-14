//! Domain entities and the invariants they enforce.
//!
//! Every type here validates on construction, so an invalid value cannot exist to be
//! passed around. Where a type is also read from disk, deserialization is routed
//! through the same validation rather than deriving past it.

mod annotation;
mod annotation_change;
mod annotation_id;
mod annotation_set;
mod bundle;
mod citation;
mod conversion;
mod conversion_request;
mod document_format;
mod document_risk;
mod excerpt;
mod facets;
mod fingerprint;
mod highlight_semantic;
mod image;
mod import;
mod label;
mod lecture_number;
mod manifest;
mod normalized_rect;
mod order_key;
mod page;
mod page_file;
mod page_number;
mod path_template;
mod relative_path;
mod renumber;
mod reorganize;
mod schema;
mod search;
mod slug;
mod source;
mod text;
mod theme;
mod timestamp;
mod vault_index;
mod vault_scan;
mod view_state;
mod zoom;

pub use annotation::Annotation;
pub use annotation_id::AnnotationId;
pub use annotation_set::{
    ANNOTATIONS_FILE_NAME, ANNOTATIONS_SCHEMA, ANNOTATIONS_SCHEMA_VERSION, AnnotationSet,
};
pub use bundle::{ASSETS_DIR_NAME, BundleRef, LectureBundle, NOTES_FILE_NAME, SOURCE_DIR_NAME};
pub use citation::{CITATION_SCHEME, Citation, CitationIndex, citation_block, citation_link};
pub use conversion::{Conversion, ConversionState};
pub use conversion_request::ConversionRequest;
pub use document_format::DocumentFormat;
pub use document_risk::{DocumentRisk, RiskScan, RiskSeverity};
pub use excerpt::Excerpt;
pub use facets::Facets;
pub use fingerprint::{Fingerprint, Fingerprinter, fingerprint, fingerprint_hex};
pub use highlight_semantic::HighlightSemantic;
pub use image::{ImageFormat, MAX_ASSET_BYTES, asset_file_name};
pub use import::{DOCUMENT_FILE_NAME, ImportPlan, ORIGINAL_FILE_STEM};
pub use label::Label;
pub use lecture_number::{
    LectureNumber, MAX_NUMBER_CHARS, SplitTitle, placed_by_number, split_number,
};
pub use manifest::{
    CURRENT_SCHEMA_VERSION, MANIFEST_FILE_NAME, MANIFEST_SCHEMA, Manifest,
    OLDEST_READABLE_SCHEMA_VERSION,
};
pub use normalized_rect::NormalizedRect;
pub use order_key::OrderKey;
pub use page::{
    MAX_PAGE_TITLE_CHARS, PAGE_FORMAT_VERSION, PAGE_SCHEME, PAGES_DIR_NAME, PageId,
    page_and_descendants, page_link, page_title,
};
pub use page_file::{PAGE_FILE_PATTERN, PageFile, PageHeader, PageUnreadable};
pub use page_number::PageNumber;
pub use path_template::{PathTemplate, Unnameable};
pub use relative_path::{MAX_BUNDLE_DEPTH, MAX_DEPTH, MAX_WITHIN_BUNDLE_DEPTH, RelativePath};
pub use renumber::{
    BlockedFolder, OrderedFolder, RENUMBERING_SUFFIX, Rename, RenumberBlock, RenumberPlan,
    plan_renumber, position_width, positioned_name, stem_of, temporary_name,
};
pub use reorganize::{
    BlockedLecture, Move, PlacedLecture, ReorganizeBlock, ReorganizePlan, plan_reorganize,
};
pub use schema::{SchemaProbe, SchemaRange};
pub use search::{LineMatch, SNIPPET_CONTEXT, SearchQuery, Snippet};
pub use slug::Slug;
pub use source::Source;
pub use theme::Theme;
pub use timestamp::Timestamp;
pub use vault_index::{
    CACHE_DIR_NAME, INDEX_FILE_NAME, INDEX_SCHEMA, INDEX_SCHEMA_VERSION, VaultIndex,
    cache_dir_segment,
};
pub use vault_scan::{SkipReason, SkippedDirectory, VaultScan, scan_vault};
pub use view_state::{
    LectureView, PageOffset, VIEW_STATE_FILE_NAME, VIEW_STATE_SCHEMA, VIEW_STATE_SCHEMA_VERSION,
    ViewState,
};
pub use zoom::{MAX_ZOOM, MIN_ZOOM, Zoom};
