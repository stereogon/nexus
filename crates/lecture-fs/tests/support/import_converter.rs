//! A converter double that writes where the port says it will.
//!
//! Not the real one: `crates/lecture-convert` already tests `LibreOffice` against a stub
//! binary and a real install. What this is for is observing the *order of operations* an
//! import performs around a converter — including, in one case, reading the manifest from
//! inside the conversion to see what it said at that moment.

use std::cell::RefCell;
use std::fs;
use std::path::{Path, PathBuf};

use lecture_core::{
    ConversionRequest, ConversionState, CoreError, DocumentConverterPort, DocumentFormat, Label,
    Manifest,
};

/// How a stand-in converter should behave.
pub(crate) enum Behaviour {
    /// Writes a plausible PDF at the requested path and succeeds.
    Converts,
    /// Fails the way a converter with no filter for the document does.
    Fails,
    /// Claims to handle nothing, as a converter for other formats would.
    HandlesNothing,
    /// Converts, having first recorded what the manifest on disk said at that moment.
    ConvertsAndWatchesTheManifest,
}

/// A converter double that writes where the port says it will.
pub(crate) struct Stub {
    label: Label,
    behaviour: Behaviour,
    vault: PathBuf,
    /// What `manifest.json` said while the conversion was running.
    pub(crate) seen: RefCell<Option<ConversionState>>,
}

impl DocumentConverterPort for Stub {
    fn label(&self) -> &Label {
        &self.label
    }

    fn supports(&self, format: DocumentFormat) -> bool {
        match self.behaviour {
            Behaviour::HandlesNothing => false,
            Behaviour::Converts | Behaviour::Fails | Behaviour::ConvertsAndWatchesTheManifest => {
                format.needs_conversion()
            }
        }
    }

    fn convert(&self, request: &ConversionRequest) -> Result<(), CoreError> {
        match self.behaviour {
            Behaviour::Fails | Behaviour::HandlesNothing => Err(CoreError::ConversionFailed {
                converter: self.label.as_str().to_owned(),
                reason: "it exited with an error",
            }),
            Behaviour::Converts | Behaviour::ConvertsAndWatchesTheManifest => {
                if matches!(self.behaviour, Behaviour::ConvertsAndWatchesTheManifest) {
                    let on_disk =
                        fs::read(self.vault.join("cs454").join("raft").join("manifest.json"))
                            .expect("the manifest must already be on disk");
                    let manifest: Manifest = serde_json::from_slice(&on_disk)
                        .expect("and must be readable while the conversion runs");

                    *self.seen.borrow_mut() = Some(manifest.source().unwrap().conversion().state());
                }

                let at = request.document().join_onto(&self.vault);
                fs::write(at, b"%PDF-1.7 converted by the stub").unwrap();

                Ok(())
            }
        }
    }
}

/// A converter double writing into `vault`.
pub(crate) fn stub(vault: &Path, behaviour: Behaviour) -> Stub {
    Stub {
        label: Label::parse("libreoffice").unwrap(),
        behaviour,
        vault: vault.to_path_buf(),
        seen: RefCell::new(None),
    }
}
