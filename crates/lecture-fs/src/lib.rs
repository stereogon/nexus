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

pub mod vault_root;

pub use vault_root::{ResolvedPath, VaultRoot};
