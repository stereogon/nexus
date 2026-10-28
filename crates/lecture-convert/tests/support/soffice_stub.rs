//! A stand-in `soffice`, so the adapter's real behaviour can be observed without one.
//!
//! An adapter verified only by reading it is not verified. The stub lets the
//! **production** `Command`-spawning, exit-status, output-checking and move-into-place
//! code run start to finish. It is a test double at the process boundary, not a mock of
//! the thing under test.
//!
//! Each converter has its own stub and its own behaviour list, included per test binary
//! with `#[path]`. One shared pair would mean every binary compiled the other converter's
//! stub and tripped `dead_code` — and a shared behaviour list would carry variants that
//! are meaningless for one of them, which is how two match arms came to be identical.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

/// How the stub should behave when it is run.
pub(crate) enum SofficeBehaviour {
    /// Writes a plausible PDF where `soffice` would, and exits 0.
    WritesAPdf,
    /// Exits non-zero, as a converter refusing the document does.
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
pub(crate) fn stub_soffice(directory: &Path, behaviour: &SofficeBehaviour) -> PathBuf {
    let body = match behaviour {
        SofficeBehaviour::WritesAPdf => {
            "printf '%%PDF-1.4 stub document' > \"$outdir/$stem.pdf\"\nexit 0\n"
        }
        SofficeBehaviour::Fails => "exit 1\n",
        SofficeBehaviour::SucceedsSilently => "exit 0\n",
        SofficeBehaviour::WritesNothing => ": > \"$outdir/$stem.pdf\"\nexit 0\n",
        SofficeBehaviour::WritesRubbish => {
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
