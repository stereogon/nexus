//! Domain entities and the invariants they enforce.
//!
//! Every type here validates on construction, so an invalid value cannot exist to be
//! passed around. Where a type is also read from disk, deserialization is routed
//! through the same validation rather than deriving past it.

mod annotation;
mod annotation_id;
mod annotation_set;
mod excerpt;
mod facets;
mod highlight_semantic;
mod label;
mod manifest;
mod normalized_rect;
mod order_key;
mod page_number;
mod relative_path;
mod schema;
mod slug;
mod source;
mod text;
mod timestamp;

pub use annotation::Annotation;
pub use annotation_id::AnnotationId;
pub use annotation_set::{ANNOTATIONS_FILE_NAME, ANNOTATIONS_SCHEMA_VERSION, AnnotationSet};
pub use excerpt::Excerpt;
pub use facets::Facets;
pub use highlight_semantic::HighlightSemantic;
pub use label::Label;
pub use manifest::{CURRENT_SCHEMA_VERSION, MANIFEST_FILE_NAME, Manifest};
pub use normalized_rect::NormalizedRect;
pub use order_key::OrderKey;
pub use page_number::PageNumber;
pub use relative_path::{MAX_DEPTH, RelativePath};
pub use schema::SchemaProbe;
pub use slug::Slug;
pub use source::{Conversion, ConversionState, Source};
pub use timestamp::Timestamp;
