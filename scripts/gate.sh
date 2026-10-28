#!/usr/bin/env bash
#
# The definition of done from CLAUDE.md §5, as one command.
#
# Exists because running these by hand every substep is how a step gets quietly skipped,
# and §1.1 forbids reporting a milestone as done when something was not run. CI calls
# this same script, so what passes locally is what passes there -- there is no second
# definition to drift.
#
# Every step runs even if an earlier one fails, because knowing all of what is broken is
# more useful than knowing the first thing. The exit code is non-zero if any step failed.
#
# Never installs anything. A missing toolchain or a missing node_modules is reported as a
# failure with what to run, because CLAUDE.md §2 makes installing the user's decision.

set -uo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly IOS_TARGET="aarch64-apple-ios"
readonly SOFFICE="/Applications/LibreOffice.app/Contents/MacOS/soffice"

cd "$ROOT"

failures=0
skips=0
summary=""

# Runs a step, records the outcome, and keeps going.
run_step() {
    local label="$1"
    shift

    echo ""
    echo "=== $label ==="

    if "$@"; then
        summary+="  ok    ${label}"$'\n'
    else
        summary+="  FAIL  ${label}"$'\n'
        failures=$((failures + 1))
    fi
}

# Records a step that genuinely cannot run here, loudly rather than silently.
#
# Distinct from `require`, which is a failure. A test needing LibreOffice on a machine
# without it is the one case CLAUDE.md §4 allows to be skipped -- genuinely
# environment-dependent -- and the summary names it so the gap is visible rather than
# looking like coverage. A step is only ever skipped for a reason stated here in the
# script, never because it failed.
skip_step() {
    local label="$1"
    local reason="$2"

    echo ""
    echo "=== $label ==="
    echo "SKIPPED: $reason"
    summary+="  skip  ${label} -- ${reason}"$'\n'
    skips=$((skips + 1))
}

# Reports a prerequisite as a failure rather than skipping the step that needs it.
require() {
    local label="$1"
    local hint="$2"

    echo ""
    echo "=== $label ==="
    echo "Missing prerequisite. Run: $hint"
    summary+="  FAIL  ${label} (not run: missing prerequisite)"$'\n'
    failures=$((failures + 1))
}

run_step "cargo fmt --check" cargo fmt --check
run_step "cargo test" cargo test
run_step "cargo clippy -D warnings" cargo clippy --all-targets -- -D warnings

# CLAUDE.md §3: lecture-core must compile for iPadOS, and a violation is a build failure.
if rustup target list --installed | grep -qx "$IOS_TARGET"; then
    run_step "cargo check --target $IOS_TARGET" \
        cargo check -p lecture-core --target "$IOS_TARGET"
else
    require "cargo check --target $IOS_TARGET" "rustup target add $IOS_TARGET"
fi

if [ -d node_modules ]; then
    run_step "npm run typecheck" npm run typecheck
    run_step "npm run lint" npm run lint
    run_step "npm run test" npm run test
else
    require "npm run typecheck" "npm ci"
    require "npm run lint" "npm ci"
    require "npm run test" "npm ci"
fi

# The converter tests that need a real LibreOffice. CLAUDE.md §4 permits the #[ignore]
# because the dependency is genuinely environmental; running them here when it is present
# is what stops the ignore becoming a place work goes to be forgotten.
if [ -x "$SOFFICE" ]; then
    # Named by target rather than `-p lecture-convert -- --ignored`, so that adding an
    # ignored test elsewhere in the crate cannot silently join the gate. Whatever runs
    # here runs on someone's machine every time they check their work.
    #
    # `--test-threads=1` is not about flakiness, and please do not remove it for speed.
    # LibreOffice's macOS build registers as a GUI application whatever flags it is given --
    # `--headless`, `--invisible`, `--nodefault` and `--nologo` were each measured and none
    # suppresses it -- so every conversion puts an icon in the Dock for about a second.
    # Running these four tests in parallel put four there at once. Measured with
    # `lsappinfo`: 12 registration lines in parallel against 3 serialised. The tests take
    # about three seconds longer and stop making a mess of someone's Dock while they work.
    run_step "converter end-to-end (LibreOffice)" \
        cargo test -p lecture-convert --test end_to_end -- --ignored --test-threads=1
else
    skip_step "converter end-to-end (LibreOffice)" \
        "LibreOffice is not installed; brew install --cask libreoffice"
fi

run_step "line limits (§4)" ./scripts/check-line-limits.sh

echo ""
echo "================================"
printf '%s' "$summary"
echo "================================"

if [ "$failures" -ne 0 ]; then
    echo "$failures step(s) failed. CLAUDE.md §5: the milestone is not done."
    exit 1
fi

if [ "$skips" -ne 0 ]; then
    echo "All steps passed, with $skips skipped -- see above for what was not checked."
    exit 0
fi

echo "All steps passed."
