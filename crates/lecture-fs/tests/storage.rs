//! Contract tests for [`AtomicFsStorage`], against a real filesystem.
//!
//! The ones that matter most are not the happy paths. They are the failure paths: a
//! write that cannot finish must leave the previous contents exactly as they were,
//! because losing someone's typing is the worst bug this app can have.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::fs;
use std::os::unix::fs as unix_fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

use lecture_core::{Slug, VaultRelativePath};
use lecture_fs::{AtomicFsStorage, VaultRoot};
use tempfile::TempDir;

fn storage() -> (TempDir, AtomicFsStorage) {
    let dir = TempDir::new().expect("create a temp directory");
    fs::create_dir_all(dir.path().join("course")).expect("create fixture folder");
    let root = VaultRoot::open(dir.path()).expect("open the temp dir as a vault");
    (dir, AtomicFsStorage::new(root))
}

fn at(raw: &str) -> VaultRelativePath {
    VaultRelativePath::parse(raw).expect("test path should be valid")
}

/// Temp files this crate leaves behind are identifiable by name.
fn staging_leftovers(dir: &Path) -> Vec<String> {
    fs::read_dir(dir)
        .expect("read the folder")
        .filter_map(|entry| {
            let name = entry.ok()?.file_name().to_string_lossy().into_owned();
            name.contains(".tmp.").then_some(name)
        })
        .collect()
}

#[test]
fn writes_and_reads_a_file() {
    let (_dir, storage) = storage();
    let path = at("course/notes.md");

    storage.write(&path, b"# Raft\n").unwrap();

    assert_eq!(storage.read(&path).unwrap(), b"# Raft\n");
}

#[test]
fn replaces_existing_contents_completely() {
    // Not appended to, and not left with a tail of the old file when the new one is
    // shorter -- which is what an in-place write would do.
    let (_dir, storage) = storage();
    let path = at("course/notes.md");

    storage
        .write(&path, b"a long first version of the notes")
        .unwrap();
    storage.write(&path, b"short").unwrap();

    assert_eq!(storage.read(&path).unwrap(), b"short");
}

#[test]
fn leaves_no_staging_files_behind() {
    let (dir, storage) = storage();

    storage.write(&at("course/notes.md"), b"one").unwrap();
    storage.write(&at("course/notes.md"), b"two").unwrap();
    storage.write(&at("course/manifest.json"), b"{}").unwrap();

    let leftovers = staging_leftovers(&dir.path().join("course"));
    assert!(
        leftovers.is_empty(),
        "staging files were left behind: {leftovers:?}"
    );
}

/// The test this module exists for.
#[test]
fn a_failed_write_does_not_touch_the_previous_contents() {
    let (dir, storage) = storage();
    let path = at("course/notes.md");
    let original = b"work that must survive a failed save";

    storage.write(&path, original).unwrap();

    // Make the folder unwritable, so creating the staging file fails.
    let folder = dir.path().join("course");
    let permissions = fs::metadata(&folder).unwrap().permissions();
    fs::set_permissions(&folder, fs::Permissions::from_mode(0o500)).unwrap();

    let result = storage.write(&path, b"a replacement that cannot be written");

    // Restore before asserting, so a failure here does not leave an unwritable
    // directory behind for the temp-dir cleanup.
    fs::set_permissions(&folder, permissions).unwrap();

    let err = result.expect_err("the write should have failed");
    assert_eq!(err.code(), "ERR_IO");
    assert_eq!(
        storage.read(&path).unwrap(),
        original,
        "the previous contents must be exactly as they were"
    );
}

#[test]
fn a_failed_write_leaves_no_staging_file_behind() {
    // The drop guard's job: a write that dies partway must not litter.
    let (dir, storage) = storage();
    let folder = dir.path().join("course");

    storage.write(&at("course/notes.md"), b"first").unwrap();

    let permissions = fs::metadata(&folder).unwrap().permissions();
    fs::set_permissions(&folder, fs::Permissions::from_mode(0o500)).unwrap();
    let _ = storage.write(&at("course/notes.md"), b"second");
    fs::set_permissions(&folder, permissions).unwrap();

    assert!(staging_leftovers(&folder).is_empty());
}

#[test]
fn refuses_to_write_through_a_symlink() {
    let (dir, storage) = storage();
    let outside = TempDir::new().unwrap();
    let decoy = outside.path().join("stolen.md");
    fs::write(&decoy, b"original outside content").unwrap();

    unix_fs::symlink(&decoy, dir.path().join("course/notes.md")).unwrap();

    let err = storage
        .write(&at("course/notes.md"), b"should not land outside")
        .unwrap_err();

    assert_eq!(err.code(), "ERR_SYMLINK_REFUSED");
    assert_eq!(
        fs::read(&decoy).unwrap(),
        b"original outside content",
        "nothing may be written through the link"
    );
}

#[test]
fn refuses_to_read_through_a_symlink() {
    let (dir, storage) = storage();
    let outside = TempDir::new().unwrap();
    let secret = outside.path().join("secret.md");
    fs::write(&secret, b"not yours").unwrap();

    unix_fs::symlink(&secret, dir.path().join("course/notes.md")).unwrap();

    let err = storage.read(&at("course/notes.md")).unwrap_err();
    assert_eq!(err.code(), "ERR_SYMLINK_REFUSED");
}

#[test]
fn reports_a_missing_file_rather_than_inventing_an_empty_one() {
    let (_dir, storage) = storage();

    let err = storage.read(&at("course/absent.md")).unwrap_err();
    assert_eq!(err.code(), "ERR_IO");
    assert!(!storage.exists(&at("course/absent.md")).unwrap());
}

#[test]
fn creates_nested_directories_and_is_idempotent() {
    let (_dir, storage) = storage();
    let path = at("course/week-02/raft-consensus");

    storage.create_dir(&path).unwrap();
    assert!(storage.exists(&path).unwrap());

    storage.create_dir(&path).expect("creating twice is fine");
}

#[test]
fn writes_into_a_directory_it_just_created() {
    let (_dir, storage) = storage();

    storage.create_dir(&at("course/week-02")).unwrap();
    storage
        .write(&at("course/week-02/manifest.json"), b"{}")
        .unwrap();

    assert_eq!(
        storage.read(&at("course/week-02/manifest.json")).unwrap(),
        b"{}"
    );
}

#[test]
fn backs_up_a_file_it_could_not_understand() {
    // The empathetic path: a file that fails to parse is preserved, not discarded, so
    // whatever someone wrote is still retrievable in any editor.
    let (_dir, storage) = storage();
    let path = at("course/annotations.json");
    let broken = b"{ this was hand-edited and is now broken";

    storage.write(&path, broken).unwrap();
    let backup = storage.back_up(&path).unwrap();

    assert_eq!(backup.file_name().unwrap(), "annotations.json.bak");
    assert_eq!(fs::read(&backup).unwrap(), broken);
    assert_eq!(
        storage.read(&path).unwrap(),
        broken,
        "backing up must not remove the original"
    );
}

#[test]
fn a_backup_stays_inside_the_vault() {
    let (_dir, storage) = storage();
    let path = at("course/annotations.json");
    storage.write(&path, b"{}").unwrap();

    let backup = storage.back_up(&path).unwrap();

    assert!(backup.starts_with(storage.root().path()));
}

#[test]
fn only_the_most_recent_backup_is_kept() {
    // The documented contract: `.bak` is the latest, not a history.
    let (_dir, storage) = storage();
    let path = at("course/annotations.json");

    storage.write(&path, b"first broken version").unwrap();
    storage.back_up(&path).unwrap();

    storage.write(&path, b"second broken version").unwrap();
    let backup = storage.back_up(&path).unwrap();

    assert_eq!(fs::read(&backup).unwrap(), b"second broken version");
}

#[test]
fn handles_a_name_at_the_length_limit() {
    // 200 bytes is the Slug cap, chosen so the staging path still fits. This proves the
    // arithmetic against a real filesystem rather than only in a comment.
    let (_dir, storage) = storage();
    let long = Slug::parse(&"a".repeat(200)).unwrap();
    let path = VaultRelativePath::parse("course")
        .unwrap()
        .child(long)
        .unwrap();

    storage
        .write(&path, b"stored under a maximal name")
        .unwrap();

    assert_eq!(storage.read(&path).unwrap(), b"stored under a maximal name");
}

#[test]
fn a_backup_of_a_maximal_name_also_fits() {
    // `.bak` plus the staging suffix on top of a 200-byte name: 237 bytes, still legal.
    let (_dir, storage) = storage();
    let long = Slug::parse(&"a".repeat(200)).unwrap();
    let path = VaultRelativePath::parse("course")
        .unwrap()
        .child(long)
        .unwrap();

    storage.write(&path, b"content").unwrap();

    let backup = storage
        .back_up(&path)
        .expect("a maximal name must still back up");
    assert_eq!(fs::read(&backup).unwrap(), b"content");
}

#[test]
fn write_errors_explain_what_was_being_attempted() {
    let (_dir, storage) = storage();

    // `week-09` does not exist, so there is no folder to stage into.
    let err = storage
        .write(&at("course/week-09/notes.md"), b"x")
        .unwrap_err();

    assert_eq!(err.code(), "ERR_IO");
    assert!(
        err.to_string().contains("temporary file"),
        "error should say what failed, got: {err}"
    );
    assert!(err.remediation().contains("untouched"));
}
