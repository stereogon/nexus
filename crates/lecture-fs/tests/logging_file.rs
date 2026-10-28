//! The one end-to-end logging test, which installs the global subscriber.
//!
//! A `tracing` subscriber is global to a **process**, and the tests in one binary run in
//! parallel threads of one process — so this file holds exactly one `#[test]`, and it
//! covers both the successful start and the refused second one in sequence. Splitting
//! them into two tests here would make them race for the global, which is how the first
//! version of this file failed.
//!
//! It writes real events through a real rolling appender into a temporary directory and
//! reads the file back, because the promise worth checking is about what ends up **on
//! disk**, not about what a function returns.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::path::Path;
use std::time::Duration;

use lecture_core::CoreError;
use lecture_fs::logging;
use tempfile::TempDir;

/// Stands in for a lecture title, which must never appear in the log.
const SENTINEL: &str = "Treatment-Resistant-Depression";

/// Everything written beneath `base`, concatenated.
fn written(base: &Path) -> String {
    fs::read_dir(base)
        .unwrap()
        .map(|entry| fs::read_to_string(entry.unwrap().path()).unwrap())
        .collect()
}

#[test]
fn a_real_log_file_records_codes_and_timings_and_nothing_private() {
    let dir = TempDir::new().unwrap();
    let base = dir.path().join("Logs").join("Nexus");
    assert!(!base.exists(), "the directory must be created by start");

    logging::start(&base).expect("logging should start in a fresh process");
    assert!(base.is_dir());

    // A failure whose message is full of exactly what must not be logged.
    let error = CoreError::SymlinkRefused {
        path: format!("/Users/someone/StudyVault/{SENTINEL}/manifest.json"),
    };
    assert!(
        error.to_string().contains(SENTINEL),
        "the test error must really carry the sentinel, or this proves nothing"
    );

    logging::failure("open a lecture", &error);
    logging::vault_opened(312, 2, 1, Duration::from_millis(240));
    logging::derived_file_discarded("index.json");
    logging::renumbered(7, true);

    let log = written(&base);

    // The useful parts arrived.
    assert!(log.contains("ERR_SYMLINK_REFUSED"), "{log}");
    assert!(log.contains(&error.log_digest()), "{log}");
    assert!(log.contains("open a lecture"), "{log}");
    assert!(log.contains("312"), "{log}");
    assert!(log.contains("240"), "{log}");
    assert!(log.contains("index.json"), "{log}");

    // And the private parts did not.
    assert!(
        !log.contains(SENTINEL),
        "a lecture title reached the log file: {log}"
    );
    assert!(
        !log.contains("StudyVault"),
        "a vault path reached the log file: {log}"
    );
    assert!(
        !log.contains(&error.to_string()),
        "the error's own message reached the log file: {log}"
    );

    // Starting again must be reported rather than silently losing the second log.
    let again = logging::start(&base).expect_err("a second subscriber must be refused");
    assert_eq!(again.code(), "ERR_LOGGING_UNAVAILABLE");
    assert!(again.remediation().contains("none of your work"));
}
