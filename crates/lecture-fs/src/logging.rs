//! The diagnostic log, and the rules about what may go in it.
//!
//! # What a line may contain
//!
//! `CLAUDE.md` §4 allows codes and timings, and §1.2 forbids study material from reaching
//! diagnostics verbatim. The trap is not the obvious one: an error's `Display` text
//! interpolates a **path**, and a path contains folder names, which contain course and
//! lecture titles.
//!
//! So this module exposes **typed events** rather than a general logging macro. A caller
//! cannot pass an error and have it formatted, because [`failure`] takes the error and
//! records only its code and [`CoreError::log_digest`]. Making the safe thing the only
//! reachable thing is the same technique as `ResolvedPath`: the rule holds because the
//! API will not express the alternative, not because everyone remembers it.
//!
//! # Rotation, and why the writes are plain
//!
//! Daily rotation, so a log kept across years cannot quietly fill someone's disk.
//!
//! Writes are synchronous. `tracing_appender::non_blocking` would hand them to a
//! background thread, which is the usual choice for a server logging thousands of lines a
//! second — but it costs a worker thread, a flush guard that silently drops lines if it is
//! dropped early, and one more thing to reason about at shutdown. This app logs codes and
//! timings at human pace. Synchronous is simpler to debug in six months, which §1.5 says
//! to prefer.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use lecture_core::CoreError;
use tracing::subscriber::SetGlobalDefaultError;

use crate::error::io_error;

/// The app's folder inside `~/Library/Logs`.
pub const LOG_DIR_NAME: &str = "Nexus";

/// The base name of the log file; rotation appends the date.
pub const LOG_FILE_NAME: &str = "app.log";

/// Where Nexus writes its log, given a home directory.
///
/// Pure, so the layout is testable without a real `HOME` and without creating anything.
#[must_use]
pub fn log_base(home: &Path) -> PathBuf {
    home.join("Library").join("Logs").join(LOG_DIR_NAME)
}

/// Starts logging into `base`, creating the directory if needed.
///
/// `base` is a parameter so that no test writes into the real `~/Library/Logs`, and
/// because where a device keeps its logs is a platform decision rather than this module's.
///
/// # Errors
///
/// Returns [`CoreError::Io`] if the directory cannot be created, or
/// [`CoreError::LoggingUnavailable`] if a subscriber is already installed — which means
/// something called this twice, and the second call would otherwise be lost silently.
pub fn start(base: &Path) -> Result<(), CoreError> {
    fs::create_dir_all(base).map_err(|e| io_error("create the log folder", base, e))?;

    let appender = tracing_appender::rolling::daily(base, LOG_FILE_NAME);

    let subscriber = tracing_subscriber::fmt()
        .json()
        .with_writer(appender)
        .with_target(true)
        .finish();

    tracing::subscriber::set_global_default(subscriber).map_err(|e| from_set_error(&e))
}

/// Starts logging in the real `~/Library/Logs/Nexus`.
///
/// # Errors
///
/// As [`start`], plus [`CoreError::HomeDirectoryUnavailable`] if `HOME` is unset.
pub fn start_for_this_device() -> Result<(), CoreError> {
    let home = std::env::var_os("HOME").ok_or(CoreError::HomeDirectoryUnavailable)?;

    start(&log_base(Path::new(&home)))
}

/// Records that a vault was opened, with counts and how long the walk took.
///
/// Counts and durations are the two things §4 names as allowed, and between them they
/// answer most of what the log is read for: how big the vault is, how slow the scan is
/// getting, and whether anything was left out.
pub fn vault_opened(lectures: usize, skipped: usize, unloadable: usize, elapsed: Duration) {
    tracing::info!(
        lectures,
        skipped,
        unloadable,
        elapsed_ms = elapsed.as_millis(),
        "vault opened"
    );
}

/// Records a failure by code and digest, never by message.
///
/// `during` is a fixed string naming the operation, not formatted input, so it cannot
/// carry anything private either.
pub fn failure(during: &'static str, error: &CoreError) {
    tracing::warn!(
        during,
        code = error.code(),
        digest = error.log_digest(),
        "operation failed"
    );
}

/// Records that a derived file was thrown away and will be rebuilt.
///
/// Separate from [`failure`] because it is not one: discarding a damaged cache is the
/// designed behaviour, and logging it at warning level would train someone to ignore
/// warnings. It is still worth a line, because a cache discarded on every launch is a
/// real problem wearing a harmless face.
pub fn derived_file_discarded(file: &'static str) {
    tracing::info!(file, "derived file discarded, rebuilding");
}

/// Records how many folders a renumber renamed, and whether it finished.
pub fn renumbered(renames: usize, complete: bool) {
    tracing::info!(renames, complete, "renumber applied");
}

/// Turns a double-install into a `CoreError`.
fn from_set_error(error: &SetGlobalDefaultError) -> CoreError {
    CoreError::LoggingUnavailable {
        detail: error.to_string(),
    }
}
