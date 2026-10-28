//! Converting documents by driving `LibreOffice` in headless mode.
//!
//! The primary strategy named in `claude-spec.md` §2.2, and the one worth preferring: it
//! handles all four non-PDF formats, runs without a GUI, and does not touch a person's
//! open documents the way scripting Keynote does.
//!
//! # The output name is `LibreOffice`'s to choose, not ours
//!
//! `soffice --convert-to pdf --outdir X original.pptx` writes `X/original.pdf` — the
//! *input's* stem, not whatever we wanted it called. So the conversion produces
//! `source/original.pdf` and that file is then moved onto `source/document.pdf`. Both
//! paths are inside the vault, so the move is a same-filesystem rename and therefore
//! atomic: nothing ever sees a half-written `document.pdf`.
//!
//! # A success that produced nothing is a failure
//!
//! `LibreOffice` can exit 0 having written no file at all — a filter it does not have, a
//! document it could not parse. Trusting the exit status alone would record a `Ready`
//! conversion pointing at a PDF that is not there. So the output is checked for existence
//! and for being non-empty before anything is moved into place.

use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use lecture_core::{ConversionRequest, CoreError, DocumentConverterPort, DocumentFormat, Label};
use lecture_fs::{AtomicFsStorage, state_base};

use crate::output;

/// Where a `.dmg` install of `LibreOffice` puts its binary.
///
/// Checked before `$PATH`, because this is where it is on a machine where someone ran
/// `brew install --cask libreoffice` or dragged the app to Applications, and a `soffice`
/// shim on `$PATH` is the rarer case.
pub const SOFFICE_BUNDLE_PATH: &str = "/Applications/LibreOffice.app/Contents/MacOS/soffice";

/// The directory, under this device's own state, that isolated profiles are made in.
const PROFILES_DIR: &str = "converters";

/// What this converter is recorded as in `manifest.json`.
///
/// Lives here, not in `lecture-core`: which tools exist is adapter knowledge, and the
/// domain deliberately knows no converter by name.
pub const CONVERTER_LABEL: &str = "libreoffice";

/// Converts documents with a headless `LibreOffice`.
pub struct LibreOfficeConverter {
    binary: PathBuf,
    profiles: PathBuf,
    storage: AtomicFsStorage,
    label: Label,
}

impl LibreOfficeConverter {
    /// Finds `LibreOffice` if it is installed, or returns `None`.
    ///
    /// `None` is not an error. No converter installed is the expected state of a machine
    /// that has only ever imported PDFs, and `CLAUDE.md` §3 requires the app to work
    /// there. The caller leaves the conversion `Queued`, which stays true and becomes
    /// useful the moment `LibreOffice` is installed.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::HomeDirectoryUnavailable`] if this device's state directory
    /// cannot be located, since that is where the isolated profile has to live.
    pub fn discover(storage: AtomicFsStorage) -> Result<Option<Self>, CoreError> {
        let Some(binary) = find_soffice() else {
            return Ok(None);
        };

        let home = std::env::home_dir().ok_or(CoreError::HomeDirectoryUnavailable)?;

        Self::at(binary, &state_base(&home), storage).map(Some)
    }

    /// Uses the `LibreOffice` at `binary`, making its profiles under `profiles`.
    ///
    /// Taking the binary rather than finding it is what lets the spawning, exit-status and
    /// output-checking logic be tested against a stub on a machine with no `LibreOffice` —
    /// and it is needed regardless, because the binary lives in two different places
    /// depending on how it was installed.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidName`] if [`CONVERTER_LABEL`] is not a usable label,
    /// which is a contradiction in this crate rather than something a caller can cause.
    /// It is still a `Result` rather than an `expect`: §4 bans the panic, and the name is
    /// validated by exactly the same rule as every other name written to a manifest.
    pub fn at(
        binary: PathBuf,
        profiles: &Path,
        storage: AtomicFsStorage,
    ) -> Result<Self, CoreError> {
        Ok(Self {
            binary,
            profiles: profiles.join(PROFILES_DIR),
            storage,
            label: Label::parse(CONVERTER_LABEL)?,
        })
    }

    /// Removes a profile directory this converter made.
    ///
    /// Best-effort on purpose: a left-behind profile costs disk space in this app's own
    /// state directory and nothing else, whereas failing a conversion that *worked*
    /// because the cleanup did not would be absurd. The path is one this function built
    /// from constants, never anything a person supplied.
    fn discard_profile(profile: &Path) {
        drop(fs::remove_dir_all(profile));
    }
}

impl DocumentConverterPort for LibreOfficeConverter {
    fn label(&self) -> &Label {
        &self.label
    }

    fn supports(&self, format: DocumentFormat) -> bool {
        // Everything it is asked to convert, which is every format that is not already a
        // PDF. This is the reason it is the preferred converter.
        format.needs_conversion()
    }

    fn convert(&self, request: &ConversionRequest) -> Result<(), CoreError> {
        let original = self.storage.root().resolve(request.original())?;
        let produced = output::intermediate_path(request)?;
        let outdir = self.storage.root().resolve(&produced)?;
        let outdir = outdir
            .as_path()
            .parent()
            .ok_or(CoreError::InvalidManifest {
                reason: "the converted document has nowhere to be written",
            })?
            .to_owned();

        let profile = self.profiles.join(unique_profile_name());
        fs::create_dir_all(&profile).map_err(|error| CoreError::Io {
            operation: "create a converter profile",
            path: profile.display().to_string(),
            source: error,
        })?;

        let status = Command::new(&self.binary)
            .args(command_arguments(&profile, &outdir, original.as_path()))
            .status();

        Self::discard_profile(&profile);

        let status = status.map_err(|error| CoreError::Io {
            operation: "run the converter",
            path: self.binary.display().to_string(),
            source: error,
        })?;

        if !status.success() {
            return Err(CoreError::ConversionFailed {
                converter: CONVERTER_LABEL.to_owned(),
                reason: "it exited with an error",
            });
        }

        // Exit 0 is not evidence of a PDF, so the output is checked before anything is
        // moved into place.
        output::commit(
            &self.storage,
            &produced,
            request.document(),
            CONVERTER_LABEL,
        )
    }
}

/// The exact arguments `soffice` is run with.
///
/// A free function taking paths, so the argument list can be asserted in a test without
/// `LibreOffice` being installed. Getting this wrong is the likeliest way for the adapter
/// to fail on a machine that *does* have it, and it is the one part that cannot be
/// observed here.
#[must_use]
pub fn command_arguments(profile: &Path, outdir: &Path, original: &Path) -> Vec<OsString> {
    let mut installation = OsString::from("-env:UserInstallation=file://");
    installation.push(profile);

    vec![
        // First, so the isolated profile is in force before anything else is interpreted.
        installation,
        OsString::from("--headless"),
        OsString::from("--convert-to"),
        OsString::from("pdf"),
        OsString::from("--outdir"),
        outdir.as_os_str().to_owned(),
        original.as_os_str().to_owned(),
    ]
}

/// A profile directory name no concurrent conversion will also choose.
///
/// `LibreOffice` locks a user profile, so two conversions sharing one would have the
/// second fail. A fresh directory each time costs its first-run setup and removes the
/// constraint entirely, which is the better trade while nothing here can measure that
/// cost.
fn unique_profile_name() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_nanos());

    format!("libreoffice-{:x}-{:x}", std::process::id(), nanos)
}

/// Looks for `soffice` where it is installed, then on `$PATH`.
fn find_soffice() -> Option<PathBuf> {
    let bundled = PathBuf::from(SOFFICE_BUNDLE_PATH);
    if bundled.is_file() {
        return Some(bundled);
    }

    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|directory| directory.join("soffice"))
        .find(|candidate| candidate.is_file())
}
