//! Domain entities and the invariants they enforce.
//!
//! Every type here validates on construction, so an invalid value cannot exist to be
//! passed around. Where a type is also read from disk, deserialization is routed
//! through the same validation rather than deriving past it.

mod annotation;
mod annotation_id;
mod annotation_set;
mod bundle;
mod citation;
mod excerpt;
mod facets;
mod fingerprint;
mod highlight_semantic;
mod label;
mod manifest;
mod normalized_rect;
mod order_key;
mod page_number;
mod relative_path;
mod renumber;
mod schema;
mod slug;
mod source;
mod text;
mod timestamp;
mod vault_index;
mod vault_scan;
mod view_state;
mod zoom;

pub use annotation::Annotation;
pub use annotation_id::AnnotationId;
pub use annotation_set::{ANNOTATIONS_FILE_NAME, ANNOTATIONS_SCHEMA_VERSION, AnnotationSet};
pub use bundle::{ASSETS_DIR_NAME, BundleRef, LectureBundle, NOTES_FILE_NAME, SOURCE_DIR_NAME};
pub use citation::{CITATION_SCHEME, Citation, CitationIndex, citation_link};
pub use excerpt::Excerpt;
pub use facets::Facets;
pub use fingerprint::{fingerprint, fingerprint_hex};
pub use highlight_semantic::HighlightSemantic;
pub use label::Label;
pub use manifest::{CURRENT_SCHEMA_VERSION, MANIFEST_FILE_NAME, Manifest};
pub use normalized_rect::NormalizedRect;
pub use order_key::OrderKey;
pub use page_number::PageNumber;
pub use relative_path::{MAX_BUNDLE_DEPTH, MAX_DEPTH, MAX_WITHIN_BUNDLE_DEPTH, RelativePath};
pub use renumber::{
    BlockedFolder, OrderedFolder, RENUMBERING_SUFFIX, Rename, RenumberBlock, RenumberPlan,
    plan_renumber, position_width, positioned_name, stem_of, temporary_name,
};
pub use schema::SchemaProbe;
pub use slug::Slug;
pub use source::{Conversion, ConversionState, Source};
pub use timestamp::Timestamp;
pub use vault_index::{
    CACHE_DIR_NAME, INDEX_FILE_NAME, INDEX_SCHEMA_VERSION, VaultIndex, cache_dir_segment,
};
pub use vault_scan::{SkipReason, SkippedDirectory, VaultScan, scan_vault};
pub use view_state::{
    LectureView, PageOffset, VIEW_STATE_FILE_NAME, VIEW_STATE_SCHEMA_VERSION, ViewState,
};
pub use zoom::{MAX_ZOOM, MIN_ZOOM, Zoom};
