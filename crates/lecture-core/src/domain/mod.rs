//! Domain entities and the invariants they enforce.
//!
//! Every type here validates on construction, so an invalid value cannot exist to be
//! passed around. Where a type is also read from disk, deserialization is routed
//! through the same validation rather than deriving past it.

mod facets;
mod label;
mod manifest;
mod normalized_rect;
mod order_key;
mod relative_path;
mod slug;
mod source;
mod text;
mod timestamp;

pub use facets::Facets;
pub use label::Label;
pub use manifest::{CURRENT_SCHEMA_VERSION, MANIFEST_FILE_NAME, Manifest, SchemaProbe};
pub use normalized_rect::NormalizedRect;
pub use order_key::OrderKey;
pub use relative_path::{MAX_DEPTH, RelativePath};
pub use slug::Slug;
pub use source::{Conversion, ConversionState, Source};
pub use timestamp::Timestamp;
