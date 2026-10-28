//! Editing the taxonomy a lecture is filed under.
//!
//! §3: *"Taxonomy lives in each bundle's `manifest.json` as facets (`course`, `module`,
//! `week`, `tags`, plus an open `custom` map). The sidebar groups on facets at runtime, so
//! one physical layout serves many logical views."*
//!
//! So this is how a lecture comes to be in a week or a module: not by moving it, but by
//! saying so in its own manifest. The folder it sits in does not have to change, and one
//! lecture can be in a week *and* a topic *and* an exam list at once — which is the thing
//! a folder tree cannot express.

use std::path::Path;

use lecture_core::{Facets, Label, LectureBundle, RelativePath};
use lecture_fs::{AtomicFsStorage, ManifestStore, SystemClock, VaultRoot};
use serde::Deserialize;

use crate::vault::{CommandError, LectureRow, row};

/// The four named facets, as the UI sends them.
///
/// Every field is optional and an empty string clears it, because "no week" has to be
/// expressible — a taxonomy you can only add to is one you cannot correct.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FacetEdit {
    /// The course this lecture belongs to.
    pub course: Option<String>,
    /// The module within that course.
    pub module: Option<String>,
    /// The week it was given in.
    pub week: Option<String>,
    /// Free-form tags.
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Files a lecture under a new taxonomy.
///
/// # Errors
///
/// Returns [`CommandError`] if the vault or the lecture cannot be read, or if a facet is
/// not usable as a [`Label`].
#[tauri::command]
pub async fn set_lecture_facets(
    vault: String,
    directory: String,
    facets: FacetEdit,
) -> Result<LectureRow, CommandError> {
    // A worker thread for the same reason as the import: a sync command runs on the main
    // one, and this reads and rewrites a file.
    tauri::async_runtime::spawn_blocking(move || file_under(&vault, &directory, &facets))
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
/// See [`set_lecture_facets`].
pub fn file_under(
    vault: &str,
    directory: &str,
    edit: &FacetEdit,
) -> Result<LectureRow, CommandError> {
    let bundle = RelativePath::parse(directory)?;
    let manifests = ManifestStore::new(
        AtomicFsStorage::new(VaultRoot::open(Path::new(vault))?),
        SystemClock,
    );

    let manifest = manifests.load(&bundle)?;
    // Computed before the manifest is consumed, since the new facets are built from the
    // old ones.
    let facets = applied(edit, manifest.facets())?;
    let replaced = manifest.with_facets(facets);

    // `save` owns `updated_at`, and it writes through the atomic path, so an interrupted
    // edit leaves the previous manifest intact rather than a truncated one.
    let saved = manifests.save(&bundle, &replaced)?;

    Ok(row(&LectureBundle::new(bundle, saved)))
}

/// The edit, applied over what the lecture already had.
///
/// Built from empty rather than mutated, so clearing a facet is expressible — but the
/// `custom` map is carried across deliberately. This command edits the four named facets,
/// and quietly dropping keys it does not understand would be exactly the kind of silent
/// loss §1.4 rules out.
fn applied(edit: &FacetEdit, existing: &Facets) -> Result<Facets, CommandError> {
    let mut facets = Facets::empty();

    for (key, value) in existing.custom() {
        facets = facets.with_custom(key, value.clone())?;
    }

    if let Some(course) = given(edit.course.as_deref())? {
        facets = facets.with_course(course);
    }

    if let Some(module) = given(edit.module.as_deref())? {
        facets = facets.with_module(module);
    }

    if let Some(week) = given(edit.week.as_deref())? {
        facets = facets.with_week(week);
    }

    let tags = edit
        .tags
        .iter()
        .filter_map(|tag| given(Some(tag)).transpose())
        .collect::<Result<Vec<_>, _>>()?;

    Ok(facets.with_tags(tags).canonicalised())
}

/// One facet value, or `None` if the field was left blank.
fn given(value: Option<&str>) -> Result<Option<Label>, CommandError> {
    match value.map(str::trim) {
        None | Some("") => Ok(None),
        Some(text) => Ok(Some(Label::parse(text)?)),
    }
}
