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

pub use domain::{NormalizedRect, OrderKey, Slug};
pub use error::CoreError;
