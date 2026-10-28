//! What became of the copy of a damaged file.
//!
//! Apart from [`CoreError`](super::CoreError) because it is not a failure — it is a fact
//! *about* one, carried so the message can state the truth rather than promise a `.bak`
//! that may not exist.

use std::fmt;

/// What happened to the copy of a damaged file.
///
/// Carried in the error so the message can state the truth. Static remediation text that
/// promised a `.bak` would be a lie whenever the copy itself failed, and being told
/// accurately where their work is, is the one thing a person needs to trust at that
/// moment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackupOutcome {
    /// A copy was saved at this path.
    Saved(String),
    /// A copy could not be saved, so the original is all there is -- and it is intact.
    Failed,
}

impl fmt::Display for BackupOutcome {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Saved(path) => write!(f, "a copy of it has been saved as `{path}`"),
            Self::Failed => f.write_str(
                "a copy of it could not be saved, so the original has been left exactly as it is",
            ),
        }
    }
}
