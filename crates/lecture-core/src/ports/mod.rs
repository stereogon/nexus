//! Capabilities the domain needs but cannot provide for itself.
//!
//! Each port is a trait declared here and implemented in a platform adapter, which is
//! what lets `lecture-core` stay free of the filesystem, of process spawning and of the
//! clock while still expressing logic that depends on them. `CLAUDE.md` §3 requires this
//! shape for every desktop-only capability; `DocumentConverterPort` will join it in
//! Milestone 2.
//!
//! The second benefit shows up in tests: a port can be driven by a deterministic double,
//! so behaviour that depends on the time of day does not depend on the time of day while
//! being tested.

mod clock;

pub use clock::{Clock, FixedClock};
