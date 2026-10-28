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

cd "$ROOT"

failures=0
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

run_step "line limits (§4)" ./scripts/check-line-limits.sh

echo ""
echo "================================"
printf '%s' "$summary"
echo "================================"

if [ "$failures" -ne 0 ]; then
    echo "$failures step(s) failed. CLAUDE.md §5: the milestone is not done."
    exit 1
fi

echo "All steps passed."
