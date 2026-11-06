//! Editing a lecture's name and the taxonomy it is filed under.
//!
//! §3: *"Taxonomy lives in each bundle's `manifest.json` as facets (`course`, `module`,
//! `week`, `tags`, plus an open `custom` map). The sidebar groups on facets at runtime, so
//! one physical layout serves many logical views."*
//!
//! So this is how a lecture comes to be in a week or a module: not by moving it, but by
//! saying so in its own manifest. The folder it sits in does not have to change, and one
//! lecture can be in a week *and* a topic *and* an exam list at once — which is the thing
//! a folder tree cannot express.
//!
//! # The title lives here too, and renames nothing on disk
//!
//! A lecture's title comes from the file it was imported from, which for anything
//! downloaded off a university system is an opaque code rather than a name. Correcting it
//! is the same shape of operation as correcting a facet — load the manifest, replace a
//! field, write it back atomically — so it is the same command and the same single write.
//!
//! The folder is **not** renamed. §3 makes the folder layout a derived projection, so a
//! title and a directory name are allowed to disagree; a reorganize is what re-derives one
//! from the other. Renaming a folder as a side effect of fixing a typo would move someone's
//! lecture while they thought they were editing text.

use std::path::Path;

use lecture_core::{
    Facets, Label, LectureBundle, LectureNumber, Manifest, RelativePath, placed_by_number,
};
use lecture_fs::{AtomicFsStorage, ManifestStore, SystemClock, VaultLoader, VaultRoot};
use serde::Deserialize;

use crate::import::order_of;
use crate::vault::{CommandError, LectureRow, row};

/// A lecture's name and its four named facets, as the UI sends them.
///
/// **An absent field is left as it was; a field that is present but empty clears it.** The
/// two are different and have to be, because a rename sends a title and nothing else:
/// treating absent as empty would wipe someone's whole taxonomy as a side effect of fixing
/// a typo in a name. A test covers it, which is how the distinction came to be made —
/// `applied` rebuilt the facets from empty and could not tell the two apart.
///
/// `title` is the one field where blank is neither: a lecture with no facets is normal, a
/// lecture with no name is not, so an empty title is **refused** rather than applied.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LectureEdit {
    /// What the person wants it called, or `None` to leave the title as it is.
    pub title: Option<String>,
    /// Its number in the course: `None` leaves it, empty clears it. A new number moves the
    /// lecture to its place among the numbered ones.
    #[serde(default)]
    pub number: Option<String>,
    /// The course this lecture belongs to.
    pub course: Option<String>,
    /// The module within that course.
    pub module: Option<String>,
    /// The week it was given in.
    pub week: Option<String>,
    /// Free-form tags, or `None` to leave the existing ones alone. An empty list clears
    /// them, which is why this is an `Option<Vec<_>>` and not a `Vec<_>` with
    /// `#[serde(default)]`: that spelling made "leave the tags" and "remove every tag"
    /// the same message.
    pub tags: Option<Vec<String>>,
}

/// Renames a lecture and files it under a new taxonomy, in one write.
///
/// # Errors
///
/// Returns [`CommandError`] if the vault or the lecture cannot be read, if the title is
/// blank, or if a title or facet is not usable as a [`Label`].
#[tauri::command]
pub async fn edit_lecture(
    vault: String,
    directory: String,
    edit: LectureEdit,
) -> Result<LectureRow, CommandError> {
    // A worker thread for the same reason as the import: a sync command runs on the main
    // one, and this reads and rewrites a file.
    tauri::async_runtime::spawn_blocking(move || apply_edit(&vault, &directory, &edit))
        .await
        .map_err(|_| CommandError {
            code: "ERR_EDIT_INTERRUPTED",
            remediation: "The change stopped before it finished. Nothing was saved; try \
                          again.",
        })?
}

/// The blocking half, which is also the testable one.
///
/// # Errors
///
/// See [`edit_lecture`].
pub fn apply_edit(
    vault: &str,
    directory: &str,
    edit: &LectureEdit,
) -> Result<LectureRow, CommandError> {
    let bundle = RelativePath::parse(directory)?;
    let manifests = ManifestStore::new(
        AtomicFsStorage::new(VaultRoot::open(Path::new(vault))?),
        SystemClock,
    );

    let manifest = manifests.load(&bundle)?;
    // Computed before the manifest is consumed, since each is built from what it already
    // holds. One write covers them all, so a rename cannot land without its facets.
    let facets = applied(edit, manifest.facets())?;
    let change = renumbered(edit)?;
    // A new number moves the lecture to its place; clearing one leaves it where it is.
    let moved = match &change {
        NumberChange::Set(new) if manifest.number() != Some(new) => {
            let others = VaultLoader::new(ManifestStore::new(
                AtomicFsStorage::new(VaultRoot::open(Path::new(vault))?),
                SystemClock,
            ))
            .load()?
            .bundles
            .into_iter()
            .filter(|held| held.directory() != &bundle)
            .collect::<Vec<_>>();

            Some(placed_by_number(&order_of(&others), new)?)
        }
        _ => None,
    };
    let mut replaced = retitled(edit, manifest)?.with_facets(facets);

    match change {
        NumberChange::Keep => {}
        NumberChange::Clear => replaced = replaced.with_number(None),
        NumberChange::Set(number) => replaced = replaced.with_number(Some(number)),
    }

    if let Some(sequence) = moved {
        replaced = replaced.resequenced(sequence);
    }

    // `save` owns `updated_at`, and it writes through the atomic path, so an interrupted
    // edit leaves the previous manifest intact rather than a truncated one.
    let saved = manifests.save(&bundle, &replaced)?;

    Ok(row(&LectureBundle::new(bundle, saved)))
}

/// What an edit does to the lecture's number.
enum NumberChange {
    Keep,
    Clear,
    Set(LectureNumber),
}

/// The number the edit asks for.
fn renumbered(edit: &LectureEdit) -> Result<NumberChange, CommandError> {
    match edit.number.as_deref().map(str::trim) {
        None => Ok(NumberChange::Keep),
        Some("") => Ok(NumberChange::Clear),
        Some(text) => LectureNumber::parse(text)
            .map(NumberChange::Set)
            .ok_or(CommandError {
                code: "ERR_LECTURE_NUMBER_UNUSABLE",
                remediation: "A lecture number is a short run of letters and digits, such as 3, \
                          3a, 3.1 or IV. Nothing was changed; try one of those forms, or leave \
                          it empty for no number.",
            }),
    }
}

/// The title the edit asks for, over the one the manifest holds.
///
/// A missing field leaves the name alone. A field cleared to blank is **refused** rather
/// than ignored, because quietly keeping the old title would tell someone their rename had
/// worked. §1.4: the failure has to be visible at the moment it happens.
fn retitled(edit: &LectureEdit, manifest: Manifest) -> Result<Manifest, CommandError> {
    match edit.title.as_deref().map(str::trim) {
        None => Ok(manifest),
        Some("") => Err(CommandError {
            code: "ERR_LECTURE_NEEDS_A_NAME",
            remediation: "A lecture needs a name. Type a title, or press Cancel to keep the \
                          one it has.",
        }),
        Some(text) => Ok(manifest.with_title(Label::parse(text)?)),
    }
}

/// The facets, applied over what the lecture already had.
///
/// Built from empty rather than mutated, so clearing a facet is expressible — which is why
/// each field has to be read against the value it is replacing rather than on its own. The
/// `custom` map is carried across deliberately: this command edits the four named facets,
/// and quietly dropping keys it does not understand would be exactly the kind of silent
/// loss §1.4 rules out.
fn applied(edit: &LectureEdit, existing: &Facets) -> Result<Facets, CommandError> {
    let mut facets = Facets::empty();

    for (key, value) in existing.custom() {
        facets = facets.with_custom(key, value.clone())?;
    }

    if let Some(course) = kept(edit.course.as_deref(), existing.course())? {
        facets = facets.with_course(course);
    }

    if let Some(module) = kept(edit.module.as_deref(), existing.module())? {
        facets = facets.with_module(module);
    }

    if let Some(week) = kept(edit.week.as_deref(), existing.week())? {
        facets = facets.with_week(week);
    }

    Ok(facets.with_tags(tags(edit, existing)?).canonicalised())
}

/// One facet value: absent keeps what the lecture had, blank clears it, anything else
/// replaces it.
///
/// # Errors
///
/// Returns [`CommandError`] if the given text is not usable as a [`Label`].
fn kept(given: Option<&str>, existing: Option<&Label>) -> Result<Option<Label>, CommandError> {
    match given.map(str::trim) {
        None => Ok(existing.cloned()),
        Some("") => Ok(None),
        Some(text) => Ok(Some(Label::parse(text)?)),
    }
}

/// The tag list, under the same rule: absent keeps, an empty list clears.
///
/// Blank entries inside a given list are dropped rather than refused, because they come
/// from splitting "exam, consensus," on commas and a trailing separator is a typing
/// artefact, not a request.
fn tags(edit: &LectureEdit, existing: &Facets) -> Result<Vec<Label>, CommandError> {
    let Some(given) = edit.tags.as_deref() else {
        return Ok(existing.tags().to_vec());
    };

    given
        .iter()
        .map(|tag| tag.trim())
        .filter(|tag| !tag.is_empty())
        .map(|tag| Label::parse(tag).map_err(CommandError::from))
        .collect()
}
