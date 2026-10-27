//! Filesystem storage adapter for Nexus.
//!
//! This crate is where I/O lives. `lecture-core` holds the domain and is required to
//! compile for `aarch64-apple-ios`, so it may not touch the filesystem; everything that
//! does is here, behind types that make the dangerous operations hard to call wrongly.
//!
//! It is deliberately **not** required to build for iOS. When iCloud is involved, iOS
//! reaches the filesystem through `NSFileCoordinator` and plain `rename` is not the
//! right primitive, so the Phase 2 companion gets its own adapter. Sharing the domain
//! and splitting the adapters is the whole reason the boundary sits where it does.
//!
//! The entry point is [`AtomicFsStorage`]. It owns a [`VaultRoot`] and takes vault
//! paths rather than filesystem paths, so containment is checked on the way through
//! every call instead of being a step a caller could skip.

mod error;
mod staging;

pub mod clock;
pub mod manifest_store;

pub mod storage;
pub mod vault_root;

pub use clock::SystemClock;
pub use manifest_store::ManifestStore;
pub use storage::AtomicFsStorage;
pub use vault_root::{ResolvedPath, VaultRoot};
