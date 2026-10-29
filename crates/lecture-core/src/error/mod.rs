//! Typed errors for every fallible operation in the domain.
//!
//! Each variant carries two things a caller cannot reconstruct on its own:
//!
//! - [`CoreError::code`] — a stable, machine-readable identifier, safe to match on in
//!   the UI and to assert on in tests. These strings are part of the public contract
//!   and must not be reworded once shipped.
//! - [`CoreError::remediation`] — one plain sentence telling the person what to do
//!   next. The reader is a tired student the night before an exam, not a developer
//!   reading a stack trace.
//!
//! The enum is `#[non_exhaustive]`: variants are added as the code that raises them
//! lands, so this list always describes failures that can genuinely occur.

mod backup_outcome;
mod core_error;
mod guidance;

pub use backup_outcome::BackupOutcome;
pub use core_error::CoreError;
