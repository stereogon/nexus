//! Capabilities the domain needs but cannot provide for itself.
//!
//! Each port is a trait declared here and implemented in a platform adapter, which is
//! what lets `lecture-core` stay free of the filesystem, of process spawning and of the
//! clock while still expressing logic that depends on them. `CLAUDE.md` §3 requires this
//! shape for every desktop-only capability.
//!
//! Only the *traits* live here. A value a port takes or returns, such as
//! [`ConversionRequest`](crate::domain::ConversionRequest), belongs in `domain`, so that
//! domain logic can build one without depending on this module.
//!
//! The second benefit shows up in tests: a port can be driven by a deterministic double,
//! so behaviour that depends on the time of day does not depend on the time of day while
//! being tested.

mod clock;
mod document_converter;
mod vault_directory;

pub use clock::{Clock, FixedClock};
pub use document_converter::{DocumentConverterPort, select_converter};
pub use vault_directory::{DirectoryEntry, EntryKind, VaultDirectory};
