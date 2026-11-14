//! Contract tests for `PageStore` — `pages/<id>.md` inside a bundle, on a real filesystem.
//!
//! The same promises as the notes: a save based on an old read never overwrites a newer
//! file, and a file that is not a readable page is kept rather than "repaired".

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use std::fs;
use std::path::PathBuf;

use lecture_core::{BackupOutcome, CoreError, PageHeader, PageId, RelativePath, Timestamp};
use lecture_fs::{AtomicFsStorage, NotesSave, PageStore, VaultRoot};
use tempfile::TempDir;

const BUNDLE: &str = "cs454/raft-consensus";

fn bundle() -> RelativePath {
    RelativePath::parse(BUNDLE).unwrap()
}

fn id(raw: &str) -> PageId {
    PageId::parse(raw).unwrap()
}

fn header(title: &str, parent: Option<&str>, created: &str) -> PageHeader {
    PageHeader {
        title: title.to_owned(),
        parent: parent.map(id),
        created: Timestamp::parse(created).unwrap(),
    }
}

fn new_store() -> (TempDir, PageStore) {
    let dir = TempDir::new().unwrap();
    let storage = AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap());
    storage.create_dir(&bundle()).unwrap();

    (dir, PageStore::new(storage))
}

fn page_file(dir: &TempDir, raw: &str) -> PathBuf {
    dir.path()
        .join(BUNDLE)
        .join("pages")
        .join(format!("{raw}.md"))
}

fn saved_version(outcome: Option<NotesSave>) -> String {
    match outcome {
        Some(NotesSave::Saved { version }) => version,
        other => panic!("expected a save, got {other:?}"),
    }
}

#[test]
fn an_item_with_no_pages_lists_none_without_making_a_folder() {
    let (dir, store) = new_store();

    let listing = store.list(&bundle()).unwrap();

    assert!(listing.pages.is_empty());
    assert_eq!(listing.unreadable, 0);
    assert!(!dir.path().join(BUNDLE).join("pages").exists());
}

#[test]
fn a_made_page_is_listed_with_its_parent_in_the_order_pages_were_made() {
    let (_dir, store) = new_store();

    store
        .create(
            &bundle(),
            &id("b"),
            &header("Split votes", Some("a"), "2026-11-14T10:00:00Z"),
        )
        .unwrap();
    store
        .create(
            &bundle(),
            &id("a"),
            &header("Leader election", None, "2026-11-14T09:00:00Z"),
        )
        .unwrap();

    let listing = store.list(&bundle()).unwrap();
    let titles: Vec<_> = listing
        .pages
        .iter()
        .map(|page| (page.title.as_str(), page.parent.as_deref()))
        .collect();

    assert_eq!(
        titles,
        vec![("Leader election", None), ("Split votes", Some("a"))]
    );
}

#[test]
fn a_page_is_never_made_over_one_that_exists() {
    let (dir, store) = new_store();
    let made = header("First", None, "2026-11-14T09:00:00Z");

    store.create(&bundle(), &id("a"), &made).unwrap();
    let before = fs::read(page_file(&dir, "a")).unwrap();

    let refused = store.create(
        &bundle(),
        &id("a"),
        &header("Second", None, "2026-11-14T09:00:00Z"),
    );

    assert!(matches!(refused, Err(CoreError::NameAlreadyTaken { .. })));
    assert_eq!(fs::read(page_file(&dir, "a")).unwrap(), before);
}

#[test]
fn a_saved_body_comes_back_and_the_front_matter_is_kept_byte_for_byte() {
    let (dir, store) = new_store();
    store
        .create(
            &bundle(),
            &id("a"),
            &header("Ideas", None, "2026-11-14T09:00:00Z"),
        )
        .unwrap();
    // A field a newer build might add, which this one must not drop.
    let file = page_file(&dir, "a");
    let with_extra =
        fs::read_to_string(&file)
            .unwrap()
            .replacen("title:", "colour: \"teal\"\ntitle:", 1);
    fs::write(&file, &with_extra).unwrap();
    let typed = "# Why randomise?\n\n> 📌 **[Page 1](cite://hl-1)**\n";

    let opened = store.load(&bundle(), &id("a")).unwrap().unwrap();
    assert_eq!(opened.text, "");
    let version = saved_version(
        store
            .save(&bundle(), &id("a"), typed, &opened.version)
            .unwrap(),
    );

    let reopened = store.load(&bundle(), &id("a")).unwrap().unwrap();
    assert_eq!(reopened.text, typed);
    assert_eq!(reopened.version, version);
    assert_eq!(
        fs::read_to_string(&file).unwrap(),
        format!("{with_extra}{typed}")
    );
    assert_eq!(
        store.list(&bundle()).unwrap().pages[0].cites,
        vec!["hl-1".to_owned()]
    );
}

#[test]
fn a_save_based_on_an_old_read_is_a_conflict_and_writes_nothing() {
    let (dir, store) = new_store();
    store
        .create(
            &bundle(),
            &id("a"),
            &header("Ideas", None, "2026-11-14T09:00:00Z"),
        )
        .unwrap();
    let opened = store.load(&bundle(), &id("a")).unwrap().unwrap();
    let file = page_file(&dir, "a");
    let elsewhere = format!("{}From the iPad", fs::read_to_string(&file).unwrap());
    fs::write(&file, &elsewhere).unwrap();

    let outcome = store
        .save(&bundle(), &id("a"), "From this Mac", &opened.version)
        .unwrap();

    match outcome {
        Some(NotesSave::Conflict { on_disk }) => assert_eq!(on_disk.text, "From the iPad"),
        other => panic!("expected a conflict, got {other:?}"),
    }
    assert_eq!(fs::read_to_string(&file).unwrap(), elsewhere);
}

#[test]
fn a_missing_page_is_none_to_load_and_to_save() {
    let (_dir, store) = new_store();

    assert_eq!(store.load(&bundle(), &id("gone")).unwrap(), None);
    assert_eq!(
        store.save(&bundle(), &id("gone"), "text", "v").unwrap(),
        None
    );
}

#[test]
fn a_damaged_page_is_counted_in_the_listing_and_copied_aside_when_opened() {
    let (dir, store) = new_store();
    store
        .create(
            &bundle(),
            &id("good"),
            &header("Fine", None, "2026-11-14T09:00:00Z"),
        )
        .unwrap();
    fs::write(page_file(&dir, "bad"), "no front matter here").unwrap();
    // Not pages at all: ignored rather than counted.
    fs::write(dir.path().join(BUNDLE).join("pages").join("notes.txt"), "x").unwrap();

    let listing = store.list(&bundle()).unwrap();
    assert_eq!(listing.pages.len(), 1);
    assert_eq!(listing.unreadable, 1);
    assert!(
        !dir.path()
            .join(BUNDLE)
            .join("pages")
            .join("bad.md.bak")
            .exists()
    );

    let opened = store.load(&bundle(), &id("bad"));
    assert!(matches!(
        opened,
        Err(CoreError::StoredFileUnreadable {
            backup: BackupOutcome::Saved(_),
            ..
        })
    ));
    assert_eq!(
        fs::read_to_string(page_file(&dir, "bad")).unwrap(),
        "no front matter here"
    );
}

#[test]
fn a_page_from_a_newer_build_is_left_alone_and_never_saved_over() {
    let (dir, store) = new_store();
    let newer = "---\nnexus-page: 9\ntitle: \"A\"\ncreated: \"2026-11-14T09:00:00Z\"\n---\n\nBody";
    fs::create_dir_all(dir.path().join(BUNDLE).join("pages")).unwrap();
    fs::write(page_file(&dir, "new"), newer).unwrap();

    assert!(matches!(
        store.load(&bundle(), &id("new")),
        Err(CoreError::SchemaVersionUnsupported { found: 9, .. })
    ));
    assert!(store.save(&bundle(), &id("new"), "over it", "any").is_err());
    assert_eq!(fs::read_to_string(page_file(&dir, "new")).unwrap(), newer);
    assert!(
        !dir.path()
            .join(BUNDLE)
            .join("pages")
            .join("new.md.bak")
            .exists()
    );
}
