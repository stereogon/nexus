//! Reading and writing an item's pages, `pages/<id>.md` inside its bundle (2026-11-14).
//!
//! What a page file holds is `lecture_core::page`'s to define; this is where it meets the
//! disk. A page's body is saved exactly as the notes are: the save carries the version it
//! was based on, and a file that changed since is answered with a conflict, not written
//! over (`notes_store` has the reasoning). The version is the whole file's, so a change to
//! the front matter on another device counts too.
//!
//! The front matter is kept byte for byte when the body is saved, so fields a newer build
//! wrote survive this one.

use lecture_core::{
    BackupOutcome, CitationIndex, CoreError, DirectoryEntry, PAGE_FILE_PATTERN,
    PAGE_FORMAT_VERSION, PAGES_DIR_NAME, PageFile, PageHeader, PageId, PageUnreadable,
    RelativePath, Slug, VaultDirectory, fingerprint_hex,
};
use serde::Serialize;

use crate::notes_store::{Notes, NotesSave, read_text};
use crate::storage::AtomicFsStorage;
use crate::vault::FsVaultDirectory;

/// What the window needs to know of a page without opening it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageSummary {
    /// What `page://` points at.
    pub id: String,
    /// Its name.
    pub title: String,
    /// The page it is inside, or `None` for one directly in the item's notes.
    pub parent: Option<String>,
    /// When it was made.
    pub created: String,
    /// The highlights it cites, so the document can show them as cited whichever note is open.
    pub cites: Vec<String>,
}

/// Every page of one item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PagesListing {
    /// In the order they were made.
    pub pages: Vec<PageSummary>,
    /// Files in `pages/` that could not be read as pages, and were left alone.
    pub unreadable: usize,
}

/// Reads and writes the pages inside bundles.
pub struct PageStore {
    storage: AtomicFsStorage,
    directory: FsVaultDirectory,
}

impl PageStore {
    /// Wraps storage.
    #[must_use]
    pub fn new(storage: AtomicFsStorage) -> Self {
        let directory = FsVaultDirectory::new(storage.root().clone());

        Self { storage, directory }
    }

    /// Every page of the bundle at `bundle`; none, not an error, if it has no `pages` folder.
    ///
    /// A file that is not a readable page is counted and left exactly as it is: listing
    /// happens on every opening, and opening the page itself is where a damaged one is
    /// copied aside and explained.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::Io`] if the folder cannot be listed, and a containment error if
    /// `bundle` does not resolve safely inside the vault.
    pub fn list(&self, bundle: &RelativePath) -> Result<PagesListing, CoreError> {
        let folder = pages_dir(bundle)?;
        let entries = if self.storage.exists(&folder)? {
            self.directory.list(Some(&folder))?
        } else {
            Vec::new()
        };
        let mut listing = PagesListing {
            pages: Vec::new(),
            unreadable: 0,
        };

        for id in entries
            .iter()
            .filter(|entry| !entry.is_directory())
            .filter_map(page_id)
        {
            match self.read(bundle, &id) {
                Ok(Some((text, _))) => match PageFile::parse(&text) {
                    Ok(page) => listing.pages.push(summary(&id, &page.header, page.body)),
                    Err(_) => listing.unreadable += 1,
                },
                Ok(None) => {}
                Err(_) => listing.unreadable += 1,
            }
        }

        listing
            .pages
            .sort_by(|a, b| a.created.cmp(&b.created).then_with(|| a.id.cmp(&b.id)));
        Ok(listing)
    }

    /// Makes an empty page named by `header` in the bundle at `bundle`.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::NameAlreadyTaken`] if a page with this id already exists, which
    /// is left untouched, and [`CoreError::Io`] if the folder or the file cannot be written.
    pub fn create(
        &self,
        bundle: &RelativePath,
        id: &PageId,
        header: &PageHeader,
    ) -> Result<PageSummary, CoreError> {
        let path = page_path(bundle, id)?;

        self.storage.create_dir(&pages_dir(bundle)?)?;

        if self.storage.exists(&path)? {
            return Err(CoreError::NameAlreadyTaken {
                path: path.to_string(),
            });
        }

        self.storage.write(&path, header.write().as_bytes())?;
        Ok(summary(id, header, ""))
    }

    /// A page's body and the version of its file, or `None` if there is no such page.
    ///
    /// # Errors
    ///
    /// For a damaged page, copies it aside and returns [`CoreError::StoredFileUnreadable`];
    /// for one from a newer build, touches nothing and returns
    /// [`CoreError::SchemaVersionUnsupported`]. Also [`CoreError::Io`] if it cannot be read.
    pub fn load(&self, bundle: &RelativePath, id: &PageId) -> Result<Option<Notes>, CoreError> {
        let Some((text, version)) = self.read(bundle, id)? else {
            return Ok(None);
        };
        let page = self.parsed(bundle, id, &text)?;

        Ok(Some(Notes {
            text: page.body.to_owned(),
            version,
        }))
    }

    /// Writes `body` as the page's, keeping its front matter, if the file is still at
    /// `based_on`; `None` if the page is gone.
    ///
    /// # Errors
    ///
    /// See [`load`](Self::load) — a page that cannot be read is never written over — and
    /// [`CoreError::Io`] if the write fails, leaving the previous file as it was.
    pub fn save(
        &self,
        bundle: &RelativePath,
        id: &PageId,
        body: &str,
        based_on: &str,
    ) -> Result<Option<NotesSave>, CoreError> {
        let Some((text, version)) = self.read(bundle, id)? else {
            return Ok(None);
        };
        let page = self.parsed(bundle, id, &text)?;

        if version != based_on {
            return Ok(Some(NotesSave::Conflict {
                on_disk: Notes {
                    text: page.body.to_owned(),
                    version,
                },
            }));
        }

        let written = format!("{}{body}", page.front);

        self.storage
            .write(&page_path(bundle, id)?, written.as_bytes())?;
        Ok(Some(NotesSave::Saved {
            version: fingerprint_hex(written.as_bytes()),
        }))
    }

    fn read(
        &self,
        bundle: &RelativePath,
        id: &PageId,
    ) -> Result<Option<(String, String)>, CoreError> {
        Ok(
            read_text(&self.storage, &page_path(bundle, id)?, PAGE_FILE_PATTERN)?
                .map(|notes| (notes.text, notes.version)),
        )
    }

    fn parsed<'a>(
        &self,
        bundle: &RelativePath,
        id: &PageId,
        text: &'a str,
    ) -> Result<PageFile<'a>, CoreError> {
        PageFile::parse(text).map_err(|problem| match problem {
            PageUnreadable::Newer { found } => CoreError::SchemaVersionUnsupported {
                file: PAGE_FILE_PATTERN,
                found,
                oldest_readable: PAGE_FORMAT_VERSION,
                current: PAGE_FORMAT_VERSION,
            },
            PageUnreadable::Damaged(detail) => CoreError::StoredFileUnreadable {
                file: PAGE_FILE_PATTERN,
                detail: detail.to_owned(),
                backup: match page_path(bundle, id).and_then(|path| self.storage.back_up(&path)) {
                    Ok(at) => BackupOutcome::Saved(at.display().to_string()),
                    Err(_) => BackupOutcome::Failed,
                },
            },
        })
    }
}

fn summary(id: &PageId, header: &PageHeader, body: &str) -> PageSummary {
    PageSummary {
        id: id.as_str().to_owned(),
        title: header.title.clone(),
        parent: header
            .parent
            .as_ref()
            .map(|parent| parent.as_str().to_owned()),
        created: header.created.as_str().to_owned(),
        cites: CitationIndex::scan(body)
            .cited_ids()
            .into_iter()
            .map(|cited| cited.as_str().to_owned())
            .collect(),
    }
}

fn page_id(entry: &DirectoryEntry) -> Option<PageId> {
    PageId::of_file_name(&entry.name)
}

/// `<bundle>/pages`.
fn pages_dir(bundle: &RelativePath) -> Result<RelativePath, CoreError> {
    bundle.child(Slug::parse(PAGES_DIR_NAME)?)
}

/// `<bundle>/pages/<id>.md`, where a page is kept.
///
/// # Errors
///
/// Returns a naming error only if `bundle` is already as deep as a path may go.
pub fn page_path(bundle: &RelativePath, id: &PageId) -> Result<RelativePath, CoreError> {
    pages_dir(bundle)?.child(Slug::parse(&id.file_name())?)
}
