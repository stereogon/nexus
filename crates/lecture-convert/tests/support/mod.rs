//! A vault and a stand-in `soffice`, so the adapter's real behaviour can be observed.
//!
//! `LibreOffice` is not installed on the machine this was written on, and an adapter
//! verified only by reading it is not verified. So the tests drive the **real**
//! `Command`-spawning, exit-status and output-checking code against a stub binary that
//! behaves the way `soffice` does, including the ways it misbehaves.
//!
//! This is a test double at the process boundary, not a mock of the thing under test: the
//! code being exercised is the production path, start to finish.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use lecture_fs::{AtomicFsStorage, VaultRoot};
use tempfile::TempDir;

/// How the stub should behave when it is run.
pub(crate) enum StubBehaviour {
    /// Writes a plausible PDF where `soffice` would, and exits 0.
    WritesAPdf,
    /// Exits non-zero, as a converter with no filter for the document does.
    Fails,
    /// Exits 0 and writes nothing at all, which `LibreOffice` really does.
    SucceedsSilently,
    /// Exits 0 and leaves a zero-length file.
    WritesNothing,
    /// Exits 0 and writes something that is not a PDF.
    WritesRubbish,
}

/// Writes an executable stub that mimics `soffice --convert-to pdf --outdir X input`.
///
/// It parses `--outdir` and the input path out of its own arguments exactly as the real
/// binary would have to, so a test that passes here is evidence the argument list is the
/// shape `soffice` expects.
pub(crate) fn stub_soffice(directory: &Path, behaviour: &StubBehaviour) -> PathBuf {
    let body = match behaviour {
        StubBehaviour::WritesAPdf => {
            "printf '%%PDF-1.4 stub document' > \"$outdir/$stem.pdf\"\nexit 0\n"
        }
        StubBehaviour::Fails => "exit 1\n",
        StubBehaviour::SucceedsSilently => "exit 0\n",
        StubBehaviour::WritesNothing => ": > \"$outdir/$stem.pdf\"\nexit 0\n",
        StubBehaviour::WritesRubbish => {
            "printf 'this is not a pdf at all' > \"$outdir/$stem.pdf\"\nexit 0\n"
        }
    };

    let script = format!(
        r#"#!/bin/sh
outdir=""
input=""
while [ $# -gt 0 ]; do
  case "$1" in
    --outdir) outdir="$2"; shift 2 ;;
    -env:*|--headless|--convert-to|pdf) shift ;;
    *) input="$1"; shift ;;
  esac
done
stem=$(basename "$input")
stem="${{stem%.*}}"
{body}"#
    );

    let path = directory.join("soffice-stub");
    fs::write(&path, script).expect("the stub should be writable");
    fs::set_permissions(&path, fs::Permissions::from_mode(0o755))
        .expect("the stub should be executable");

    path
}

/// A vault holding one lecture whose original is waiting to be converted.
pub(crate) struct Fixture {
    pub(crate) vault: TempDir,
    pub(crate) profiles: TempDir,
}

impl Fixture {
    /// Creates `cs454/raft/source/original.pptx` inside a fresh vault.
    pub(crate) fn new() -> Self {
        let vault = TempDir::new().expect("a temporary vault");
        let source = vault.path().join("cs454").join("raft").join("source");
        fs::create_dir_all(&source).expect("the bundle layout");
        fs::write(source.join("original.pptx"), b"a slide deck").expect("the original");

        Self {
            vault,
            profiles: TempDir::new().expect("a temporary profiles directory"),
        }
    }

    pub(crate) fn storage(&self) -> AtomicFsStorage {
        AtomicFsStorage::new(VaultRoot::open(self.vault.path()).expect("the vault should open"))
    }

    /// The absolute path of something inside the lecture's `source/` directory.
    pub(crate) fn in_source(&self, name: &str) -> PathBuf {
        self.vault
            .path()
            .join("cs454")
            .join("raft")
            .join("source")
            .join(name)
    }
}
