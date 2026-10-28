//! Contract tests for where the log goes and what it may contain.
//!
//! Pure-function and path tests only. The end-to-end test that installs a subscriber and
//! reads a written file lives in `logging_file.rs`, because a subscriber is global to a
//! process and the tests in one binary run in parallel threads of one process.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::path::Path;

use lecture_fs::logging::{LOG_DIR_NAME, LOG_FILE_NAME, log_base};

#[test]
fn the_log_lives_under_library_logs() {
    // Pure, so the real layout is checked without touching a real home directory.
    let base = log_base(Path::new("/Users/someone"));

    assert_eq!(base, Path::new("/Users/someone/Library/Logs/Nexus"));
}

#[test]
fn the_directory_is_named_for_the_app_and_not_the_crates() {
    // `lecture-core` and `lecture-fs` keep the project's earlier name; this directory is
    // one a person opens in Finder, so it carries the name they know.
    assert_eq!(LOG_DIR_NAME, "Nexus");
    assert_eq!(LOG_FILE_NAME, "app.log");
}

#[test]
fn the_log_directory_is_created_before_a_subscriber_is_attempted() {
    // So a missing directory is never the reason a run has no log. The start itself may
    // fail here if another test in this binary installed a subscriber first, which is
    // why only the directory is asserted.
    let dir = tempfile::TempDir::new().unwrap();
    let base = dir.path().join("deep").join("Logs").join("Nexus");
    assert!(!base.exists());

    let _ = lecture_fs::logging::start(&base);

    assert!(base.is_dir());
}
