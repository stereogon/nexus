//! Reading a stored file's schema version before trusting the rest of it.

use serde::Deserialize;

/// Just enough of any versioned file to read its version.
///
/// A file written by a newer build may not deserialise as the current shape at all, so
/// the version has to be readable on its own. Unknown fields are allowed *here*
/// precisely because this probe's whole job is to inspect a file it does not understand.
///
/// Shared by `manifest.json` and `annotations.json`. The two carry independent version
/// numbers — they change for different reasons, and coupling them would force a
/// migration of one whenever the other grew a field — but they are *read* the same way.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaProbe {
    /// The version the file claims to be.
    pub schema_version: u32,
}
