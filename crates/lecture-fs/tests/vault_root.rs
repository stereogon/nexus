//! Containment tests for [`VaultRoot`], against a real filesystem.
//!
//! These cannot be done with an in-memory fake: the behaviour under test *is* the
//! filesystem's — symbolic links, missing components, canonicalisation. Every test runs
//! inside a `tempfile::TempDir` that is removed when it drops, so nothing touches a real
//! vault.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::os::unix::fs as unix_fs;
use std::path::Path;

use lecture_core::RelativePath;
use lecture_fs::VaultRoot;
use tempfile::TempDir;

/// A vault root with `course/week-01` already created inside it.
fn vault() -> (TempDir, VaultRoot) {
    let dir = TempDir::new().expect("create a temp directory");
    fs::create_dir_all(dir.path().join("course/week-01")).expect("create fixture folders");
    let root = VaultRoot::open(dir.path()).expect("open the temp dir as a vault");
    (dir, root)
}

fn path(raw: &str) -> RelativePath {
    RelativePath::parse(raw).expect("test path should be valid")
}

#[test]
fn opens_a_real_directory() {
    let (dir, root) = vault();

    // Canonicalised, so comparison is against the resolved location: on macOS the temp
    // directory itself sits behind /private.
    let expected = fs::canonicalize(dir.path()).unwrap();
    assert_eq!(root.path(), expected.as_path());
}

#[test]
fn refuses_a_root_that_is_not_a_directory() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("notes.md");
    fs::write(&file, b"not a vault").unwrap();

    let err = VaultRoot::open(&file).unwrap_err();
    assert_eq!(err.code(), "ERR_VAULT_ROOT_UNUSABLE");
}

#[test]
fn refuses_a_root_that_does_not_exist() {
    let dir = TempDir::new().unwrap();

    let err = VaultRoot::open(&dir.path().join("nope")).unwrap_err();
    assert_eq!(err.code(), "ERR_IO");
    assert!(
        err.remediation().contains("untouched"),
        "remediation should reassure that nothing was changed, got: {}",
        err.remediation()
    );
}

#[test]
fn allows_a_symlinked_root_because_that_is_the_users_own_choice() {
    // Keeping a vault on an external drive and linking to it is legitimate. The link is
    // resolved once, at open, and everything is then checked against the real location.
    let real = TempDir::new().unwrap();
    let elsewhere = TempDir::new().unwrap();
    let link = elsewhere.path().join("MyVault");
    unix_fs::symlink(real.path(), &link).unwrap();

    let root = VaultRoot::open(&link).expect("a symlinked root is allowed");

    assert_eq!(
        root.path(),
        fs::canonicalize(real.path()).unwrap().as_path()
    );
}

#[test]
fn resolves_a_path_that_already_exists() {
    let (_dir, root) = vault();

    let resolved = root.resolve(&path("course/week-01")).unwrap();

    assert_eq!(resolved.as_path(), root.path().join("course/week-01"));
}

#[test]
fn resolves_a_path_that_does_not_exist_yet() {
    // Required, not tolerated: this is how a new bundle's location is computed before
    // the bundle is created.
    let (_dir, root) = vault();

    let resolved = root
        .resolve(&path("course/week-02/raft-consensus"))
        .unwrap();

    assert!(!resolved.as_path().exists());
    assert!(resolved.as_path().starts_with(root.path()));
}

/// The test this whole module exists for.
#[test]
fn refuses_a_symlink_that_escapes_the_vault() {
    let (_dir, root) = vault();
    let outside = TempDir::new().unwrap();
    fs::write(outside.path().join("secret.txt"), b"not yours").unwrap();

    // `escape` is lexically inside the vault and physically is not.
    unix_fs::symlink(outside.path(), root.path().join("escape")).unwrap();

    let err = root.resolve(&path("escape/secret.txt")).unwrap_err();

    assert_eq!(err.code(), "ERR_SYMLINK_REFUSED");
}

#[test]
fn refuses_a_symlink_at_the_end_of_the_path() {
    let (_dir, root) = vault();
    let outside = TempDir::new().unwrap();

    unix_fs::symlink(outside.path(), root.path().join("course/week-01/link")).unwrap();

    let err = root.resolve(&path("course/week-01/link")).unwrap_err();
    assert_eq!(err.code(), "ERR_SYMLINK_REFUSED");
}

#[test]
fn refuses_a_symlink_even_when_it_points_back_inside_the_vault() {
    // Not a traversal escape, but still refused: two routes to one bundle double-counts
    // it on a vault walk, and gives a sync client a loop to chase.
    let (_dir, root) = vault();

    unix_fs::symlink(root.path().join("course"), root.path().join("alias")).unwrap();

    let err = root.resolve(&path("alias/week-01")).unwrap_err();
    assert_eq!(err.code(), "ERR_SYMLINK_REFUSED");
}

#[test]
fn refuses_a_symlink_partway_up_an_otherwise_valid_path() {
    let (_dir, root) = vault();
    let outside = TempDir::new().unwrap();
    fs::create_dir_all(outside.path().join("week-01")).unwrap();

    unix_fs::symlink(outside.path(), root.path().join("course/aliased")).unwrap();

    let err = root
        .resolve(&path("course/aliased/week-01"))
        .expect_err("a link mid-path must be caught");
    assert_eq!(err.code(), "ERR_SYMLINK_REFUSED");
}

#[test]
fn a_broken_symlink_is_refused_rather_than_treated_as_missing() {
    // A dangling link reports NotFound through `exists()`, so treating "missing" as
    // "safe to create" would quietly write through the link once its target appeared.
    let (_dir, root) = vault();
    unix_fs::symlink(
        Path::new("/nonexistent/target"),
        root.path().join("dangling"),
    )
    .unwrap();

    let err = root.resolve(&path("dangling/notes.md")).unwrap_err();
    assert_eq!(err.code(), "ERR_SYMLINK_REFUSED");
}

#[test]
fn every_resolved_path_is_inside_the_root() {
    let (_dir, root) = vault();
    let outside = TempDir::new().unwrap();
    unix_fs::symlink(outside.path(), root.path().join("escape")).unwrap();

    let candidates = [
        "course",
        "course/week-01",
        "course/week-02/new-lecture",
        "escape",
        "escape/secret.txt",
        "course/week-01/assets/figure.png",
    ];

    let mut resolved_count = 0;
    for raw in candidates {
        let Ok(resolved) = root.resolve(&path(raw)) else {
            continue;
        };
        resolved_count += 1;

        assert!(
            resolved.as_path().starts_with(root.path()),
            "`{raw}` resolved to `{}`, outside the root",
            resolved.as_path().display()
        );
    }

    // Guards against the assertion above being vacuous if resolution started failing.
    assert!(
        resolved_count >= 4,
        "only {resolved_count} paths resolved, so containment was barely exercised"
    );
}

#[test]
fn resolution_does_not_create_anything() {
    // Resolving is a question, not an instruction. Nothing should appear on disk.
    let (_dir, root) = vault();

    let _ = root.resolve(&path("course/week-09/brand-new")).unwrap();

    assert!(!root.path().join("course/week-09").exists());
}
