//! Converting documents by asking `Keynote` or `Pages` to export them.
//!
//! The secondary fallback named in `claude-spec.md` §2.2, for a machine with no
//! `LibreOffice`. Apple's own apps read `.pptx` and `.docx` well, and on a Mac they are
//! usually already there.
//!
//! # Paths are arguments, never script text
//!
//! The obvious way to write this is to interpolate the file path into the `AppleScript`
//! source. That would be **script injection**: a vault folder named with a quote would
//! end the string literal and the rest would be executed. `Slug` forbids quotes inside a
//! vault, but the vault's own root is an arbitrary path the person chose, and nothing
//! stops it containing one.
//!
//! So the script is a constant that reads `on run argv`, and the paths are passed to
//! `osascript` as arguments. Nothing a person can name ever becomes code. This is the
//! same instinct as `ResolvedPath` and the typed logging events: make the unsafe version
//! unspellable rather than remembering not to write it.
//!
//! # It is a fallback, and it is not invisible
//!
//! Exporting through `Keynote` **launches `Keynote`**. The script opens one document and
//! closes it again with `saving no`, so it never touches anything else the person has
//! open, but the app does appear. `LibreOffice` is preferred for that reason as much as
//! any — and preference is the caller's, expressed by the order it passes converters to
//! `select_converter`.
//!
//! The first run also triggers macOS's automation consent dialog. A refusal comes back as
//! `AppleEvent` error `-1743`, which is recognised and reported as
//! [`CoreError::ConverterNotPermitted`] so the remediation can name System Settings
//! instead of suggesting a pointless retry.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Command;

use lecture_core::{ConversionRequest, CoreError, DocumentConverterPort, DocumentFormat, Label};
use lecture_fs::AtomicFsStorage;

use crate::output;

/// The interpreter every macOS install has.
pub const OSASCRIPT_PATH: &str = "/usr/bin/osascript";

/// The `AppleEvent` error macOS returns when automation consent has not been given.
const NOT_AUTHORIZED: &str = "-1743";

/// One of Apple's document apps.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IworkApp {
    /// Reads `.ppt` and `.pptx`.
    Keynote,
    /// Reads `.doc` and `.docx`.
    Pages,
}

impl IworkApp {
    /// Every app this adapter can drive.
    pub const ALL: [Self; 2] = [Self::Keynote, Self::Pages];

    /// The name `AppleScript` addresses it by.
    #[must_use]
    pub const fn application_name(self) -> &'static str {
        match self {
            Self::Keynote => "Keynote",
            Self::Pages => "Pages",
        }
    }

    /// What this converter is recorded as in `manifest.json`.
    #[must_use]
    pub const fn converter_label(self) -> &'static str {
        match self {
            Self::Keynote => "keynote",
            Self::Pages => "pages",
        }
    }

    /// Where the app is installed.
    #[must_use]
    pub fn bundle_path(self) -> PathBuf {
        PathBuf::from("/Applications").join(format!("{}.app", self.application_name()))
    }

    /// Whether this app reads `format`.
    #[must_use]
    pub const fn reads(self, format: DocumentFormat) -> bool {
        match self {
            Self::Keynote => matches!(format, DocumentFormat::Ppt | DocumentFormat::Pptx),
            Self::Pages => matches!(format, DocumentFormat::Doc | DocumentFormat::Docx),
        }
    }
}

/// Converts documents by driving `Keynote` or `Pages` through `osascript`.
pub struct IworkConverter {
    app: IworkApp,
    osascript: PathBuf,
    storage: AtomicFsStorage,
    label: Label,
}

impl IworkConverter {
    /// Finds `app` if it is installed, or returns `None`.
    ///
    /// `None` is not an error, for the same reason it is not one in the `LibreOffice`
    /// adapter: a machine with no converter must still run the app.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidName`] if the app's label is not a usable one, which
    /// would be a contradiction in this crate rather than anything a caller caused.
    pub fn discover(app: IworkApp, storage: AtomicFsStorage) -> Result<Option<Self>, CoreError> {
        if !app.bundle_path().is_dir() {
            return Ok(None);
        }

        Self::at(app, PathBuf::from(OSASCRIPT_PATH), storage).map(Some)
    }

    /// Drives `app` using the `osascript` at the given path.
    ///
    /// Taking the interpreter rather than assuming it is what lets the real spawning,
    /// exit-status and output-checking code be exercised against a stub, without `Keynote`
    /// being launched on anyone's machine.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidName`] if the app's label is not a usable one.
    pub fn at(
        app: IworkApp,
        osascript: PathBuf,
        storage: AtomicFsStorage,
    ) -> Result<Self, CoreError> {
        Ok(Self {
            app,
            osascript,
            storage,
            label: Label::parse(app.converter_label())?,
        })
    }

    /// Which app this converter drives.
    #[must_use]
    pub const fn app(&self) -> IworkApp {
        self.app
    }
}

impl DocumentConverterPort for IworkConverter {
    fn label(&self) -> &Label {
        &self.label
    }

    fn supports(&self, format: DocumentFormat) -> bool {
        self.app.reads(format)
    }

    fn convert(&self, request: &ConversionRequest) -> Result<(), CoreError> {
        if !self.supports(request.format()) {
            return Err(CoreError::UnsupportedDocumentFormat {
                extension: request.format().extension().to_owned(),
            });
        }

        let original = self.storage.root().resolve(request.original())?;
        let produced = output::intermediate_path(request)?;
        let destination = self.storage.root().resolve(&produced)?;

        // `output` rather than `status`: stderr is needed to tell a refused automation
        // consent from an ordinary failure. It is **scanned** for a known error code and
        // never stored, because §4 forbids a person's file names reaching the log and a
        // converter's stderr is full of them.
        let run = Command::new(&self.osascript)
            .args(command_arguments(
                self.app,
                original.as_path(),
                destination.as_path(),
            ))
            .output()
            .map_err(|error| CoreError::Io {
                operation: "run the converter",
                path: self.osascript.display().to_string(),
                source: error,
            })?;

        if !run.status.success() {
            let stderr = String::from_utf8_lossy(&run.stderr);

            if stderr.contains(NOT_AUTHORIZED) {
                return Err(CoreError::ConverterNotPermitted {
                    converter: self.app.application_name().to_owned(),
                });
            }

            return Err(CoreError::ConversionFailed {
                converter: self.app.converter_label().to_owned(),
                reason: "it exited with an error",
            });
        }

        // `osascript` exits 0 when the *script* ran, which is not the same as the export
        // having worked, so the output is checked before anything is moved into place.
        output::commit(
            &self.storage,
            &produced,
            request.document(),
            self.app.converter_label(),
        )
    }
}

/// The exact arguments `osascript` is run with.
///
/// A free function so the argument list can be asserted without either app being
/// launched. The paths are the last two arguments and reach the script as `argv`; they are
/// never part of the script text.
#[must_use]
pub fn command_arguments(app: IworkApp, original: &Path, destination: &Path) -> Vec<OsString> {
    vec![
        OsString::from("-e"),
        OsString::from(export_script(app)),
        original.as_os_str().to_owned(),
        destination.as_os_str().to_owned(),
    ]
}

/// The `AppleScript` that exports one document to PDF.
///
/// A function of the app name alone — no path, no file name, nothing a person typed. The
/// `on run argv` handler is what makes that possible.
///
/// `close … saving no` matters twice over: it leaves the opened document unmodified, and
/// it closes only that document, so nothing else the person has open in the app is
/// touched.
#[must_use]
pub fn export_script(app: IworkApp) -> String {
    format!(
        r#"on run argv
    set sourceFile to POSIX file (item 1 of argv)
    set exportFile to POSIX file (item 2 of argv)
    tell application "{}"
        set theDocument to open sourceFile
        export theDocument to exportFile as PDF
        close theDocument saving no
    end tell
end run"#,
        app.application_name()
    )
}
