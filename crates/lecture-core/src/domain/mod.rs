//! Domain entities and the invariants they enforce.
//!
//! Every type here validates on construction, so an invalid value cannot exist to be
//! passed around. Where a type is also read from disk, deserialization is routed
//! through the same validation rather than deriving past it.

mod normalized_rect;
mod order_key;

pub use normalized_rect::NormalizedRect;
pub use order_key::OrderKey;
