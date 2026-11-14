//! Contract tests for the page commands, against real temporary vaults, and the half of a
//! pair that writes `fixtures/pages.json` for `src/ipc/pages.test.ts`.
//!
//! ```text
//! UPDATE_FIXTURES=1 cargo test -p nexus-app --test pages
//! ```

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

use std::fs;
use std::path::{Path, PathBuf};

use lecture_core::RelativePath;
use lecture_fs::{AtomicFsStorage, NotesSave, VaultRoot};
use nexus_app::pages::{make_page, read_page, trash_page, write_page};
use nexus_app::search::find_in_vault;
use tempfile::TempDir;

const RAFT: &str = "cs454/raft";

fn vault() -> TempDir {
    let dir = TempDir::new().unwrap();
    let storage = AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap());

    storage
        .create_dir(&RelativePath::parse(RAFT).unwrap())
        .unwrap();
    dir
}

fn root(dir: &TempDir) -> &str {
    dir.path().to_str().unwrap()
}

fn pages_dir(dir: &TempDir) -> PathBuf {
    dir.path().join(RAFT).join("pages")
}

fn files_in(folder: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(folder)
        .map(|entries| {
            entries
                .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();

    names.sort();
    names
}

#[test]
fn a_page_is_made_inside_the_notes_or_inside_another_page_of_the_same_item() {
    let dir = vault();

    let top = make_page(root(&dir), RAFT, "  Leader election ideas ", None).unwrap();
    let inner = make_page(root(&dir), RAFT, "Split votes", Some(&top.id)).unwrap();

    assert_eq!(top.title, "Leader election ideas");
    assert_eq!(top.parent, None);
    assert_eq!(inner.parent.as_deref(), Some(top.id.as_str()));
    assert_eq!(files_in(&pages_dir(&dir)).len(), 2);
}

#[test]
fn a_page_needs_a_name_and_a_parent_that_exists() {
    let dir = vault();

    assert_eq!(
        make_page(root(&dir), RAFT, "   ", None).unwrap_err().code,
        "ERR_INVALID_NAME"
    );
    assert_eq!(
        make_page(root(&dir), RAFT, "Orphan", Some("nobody"))
            .unwrap_err()
            .code,
        "ERR_PAGE_NOT_FOUND"
    );
    assert!(files_in(&pages_dir(&dir)).is_empty());
}

#[test]
fn a_page_saves_and_opens_and_a_missing_one_says_so() {
    let dir = vault();
    let page = make_page(root(&dir), RAFT, "Ideas", None).unwrap();
    let opened = read_page(root(&dir), RAFT, &page.id).unwrap();

    let saved = write_page(
        root(&dir),
        RAFT,
        &page.id,
        "Why randomise?",
        &opened.version,
    )
    .unwrap();

    assert!(matches!(saved, NotesSave::Saved { .. }));
    assert_eq!(
        read_page(root(&dir), RAFT, &page.id).unwrap().text,
        "Why randomise?"
    );
    assert_eq!(
        read_page(root(&dir), RAFT, "gone").unwrap_err().code,
        "ERR_PAGE_NOT_FOUND"
    );
    assert_eq!(
        write_page(root(&dir), RAFT, "gone", "x", "v")
            .unwrap_err()
            .code,
        "ERR_PAGE_NOT_FOUND"
    );
}

#[test]
fn deleting_a_page_moves_it_and_every_page_inside_it_to_the_trash_and_nothing_else() {
    let dir = vault();
    let top = make_page(root(&dir), RAFT, "Top", None).unwrap();
    let inner = make_page(root(&dir), RAFT, "Inner", Some(&top.id)).unwrap();
    let innermost = make_page(root(&dir), RAFT, "Innermost", Some(&inner.id)).unwrap();
    let other = make_page(root(&dir), RAFT, "Other", None).unwrap();

    let moved = trash_page(root(&dir), RAFT, &top.id).unwrap();

    assert_eq!(
        moved,
        vec![top.id.clone(), inner.id.clone(), innermost.id.clone()]
    );
    assert_eq!(files_in(&pages_dir(&dir)), vec![format!("{}.md", other.id)]);
    assert_eq!(files_in(&dir.path().join(".trash")).len(), 3);
    assert_eq!(
        trash_page(root(&dir), RAFT, &top.id).unwrap_err().code,
        "ERR_PAGE_NOT_FOUND"
    );
}

#[test]
fn search_finds_a_page_by_its_title_or_its_text() {
    let dir = vault();
    let by_title = make_page(root(&dir), RAFT, "Randomised timeouts", None).unwrap();
    let by_text = make_page(root(&dir), RAFT, "Elsewhere", Some(&by_title.id)).unwrap();
    let opened = read_page(root(&dir), RAFT, &by_text.id).unwrap();
    write_page(
        root(&dir),
        RAFT,
        &by_text.id,
        "Followers time out\nat random",
        &opened.version,
    )
    .unwrap();

    let found = find_in_vault(root(&dir), &[RAFT.to_owned()], "random").unwrap();
    let pages = &found.lectures[0].pages;

    assert_eq!(pages.len(), 2);
    assert_eq!(pages[0].id, by_title.id);
    assert!(pages[0].title_match.is_some());
    assert_eq!(pages[1].parent.as_deref(), Some(by_title.id.as_str()));
    assert_eq!(
        pages[1].parent_title.as_deref(),
        Some("Randomised timeouts")
    );
    assert_eq!(pages[1].notes[0].line, 2);
}

#[test]
fn the_page_payloads_match_the_committed_fixture() {
    let dir = vault();
    let folder = pages_dir(&dir);
    fs::create_dir_all(&folder).unwrap();
    // Written by hand, so ids and dates stay fixed.
    fs::write(
        folder.join("pg-1.md"),
        "---\nnexus-page: 1\ntitle: \"Ideas\"\ncreated: \"2026-11-14T09:00:00Z\"\n---\n\n> 📌 **[Page 2](cite://hl-1)**\n",
    )
    .unwrap();
    fs::write(
        folder.join("pg-2.md"),
        "---\nnexus-page: 1\ntitle: \"Inside\"\nparent: \"pg-1\"\ncreated: \"2026-11-14T10:00:00Z\"\n---\n\n",
    )
    .unwrap();
    fs::write(folder.join("pg-3.md"), "damaged").unwrap();
    let store =
        lecture_fs::PageStore::new(AtomicFsStorage::new(VaultRoot::open(dir.path()).unwrap()));
    let raft = RelativePath::parse(RAFT).unwrap();
    let opened = read_page(root(&dir), RAFT, "pg-2").unwrap();

    let json = serde_json::json!({
        "listing": store.list(&raft).unwrap(),
        "opened": opened,
        "saved": write_page(root(&dir), RAFT, "pg-2", "Body", &opened.version).unwrap(),
        // A title with every character the link escapes, for `src/notes/pageLinks.test.ts`.
        "link": {
            "id": "pg-1",
            "title": r"Raft [draft] \ notes",
            "line": lecture_core::page_link(&lecture_core::PageId::parse("pg-1").unwrap(), r"Raft [draft] \ notes"),
        },
    });
    let mut actual = serde_json::to_vec_pretty(&json).unwrap();
    actual.push(b'\n');
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/pages.json");

    if std::env::var_os("UPDATE_FIXTURES").is_some() {
        fs::write(&path, &actual).unwrap();
        return;
    }

    assert_eq!(
        String::from_utf8_lossy(&actual),
        String::from_utf8_lossy(&fs::read(&path).unwrap()),
        "regenerate with: UPDATE_FIXTURES=1 cargo test -p nexus-app --test pages"
    );
}
