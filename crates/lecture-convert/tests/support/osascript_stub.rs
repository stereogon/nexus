//! A stand-in `osascript`, so Keynote and Pages are never launched by a test.
//!
//! The stub is an assertion in its own right. It refuses to run unless the paths arrive as
//! **arguments**, and fails loudly if the input path appears anywhere in the script text —
//! so if the adapter ever went back to interpolating paths into `AppleScript`, every test
//! using it would fail rather than quietly passing.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

/// How the stub should behave when it is run.
pub(crate) enum OsascriptBehaviour {
    /// Exports a plausible PDF to the path it was given, and exits 0.
    WritesAPdf,
    /// Fails with an ordinary `AppleScript` error, not a permission one.
    Fails,
    /// Exits 0 having exported nothing, which is what a script that merely ran looks like.
    SucceedsSilently,
    /// Exits 0 and leaves a zero-length file.
    WritesNothing,
    /// Exits 0 and writes something that is not a PDF.
    WritesRubbish,
    /// Fails the way macOS does when automation consent has not been given.
    RefusesPermission,
}

/// Writes an executable stub that mimics `osascript -e <script> <input> <output>`.
pub(crate) fn stub_osascript(directory: &Path, behaviour: &OsascriptBehaviour) -> PathBuf {
    let body = match behaviour {
        OsascriptBehaviour::WritesAPdf => "printf '%%PDF-1.4 stub export' > \"$out\"\nexit 0\n",
        OsascriptBehaviour::Fails => {
            "echo 'execution error: Keynote got an error: cannot open (-1728)' >&2\nexit 1\n"
        }
        OsascriptBehaviour::SucceedsSilently => "exit 0\n",
        OsascriptBehaviour::WritesNothing => ": > \"$out\"\nexit 0\n",
        OsascriptBehaviour::WritesRubbish => "printf 'not a pdf' > \"$out\"\nexit 0\n",
        // The real message, so the adapter is matched against what macOS actually says.
        OsascriptBehaviour::RefusesPermission => {
            "echo 'execution error: Not authorized to send Apple events to Keynote. (-1743)' >&2\n\
             exit 1\n"
        }
    };

    // `$1` is `-e` and `$2` the script; the paths follow, and reach AppleScript as `argv`.
    let script = format!(
        r#"#!/bin/sh
if [ "$1" != "-e" ]; then
  echo "expected -e, got $1" >&2
  exit 64
fi
script="$2"
in="$3"
out="$4"
if [ -z "$in" ] || [ -z "$out" ]; then
  echo "paths must arrive as arguments, not inside the script" >&2
  exit 64
fi
case "$script" in
  *"$in"*) echo "the input path was interpolated into the script" >&2; exit 65 ;;
esac
{body}"#
    );

    let path = directory.join("osascript-stub");
    fs::write(&path, script).expect("the stub should be writable");
    fs::set_permissions(&path, fs::Permissions::from_mode(0o755))
        .expect("the stub should be executable");

    path
}
