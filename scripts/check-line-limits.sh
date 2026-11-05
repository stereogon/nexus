#!/usr/bin/env bash
#
# Enforces CLAUDE.md §4: source files stay under 300 lines.
#
# A script rather than a line in a workflow, because the limit is only useful if it is
# checked before a commit rather than after a push. It has drifted repeatedly when it was
# something to remember instead of something to run.
#
# Tests count. They are source, they are read far more often than they are written, and
# the files that have needed splitting here have as often been tests as not.
#
# The Playwright suite in `e2e/` counts too, from the day it was added (2026-11-05),
# rather than after it has grown a file that needs splitting.
#
# Stylesheets count too, added 2026-10-29. They were not checked, and that is exactly how
# `theme.css` reached 1204 lines without anything complaining -- the file the limit existed
# to prevent was the one file the limit did not look at.
#
# *Corrected 2026-11-05:* the sentence above was written, but `*.css` never reached the
# `find` below, so for a week stylesheets were still not checked while this file said they
# were. Found when two of them were noticed at 303 lines.

set -euo pipefail

readonly LIMIT=300
readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

over_limit=""

while IFS= read -r file; do
    lines=$(wc -l < "$file" | tr -d ' ')
    if [ "$lines" -gt "$LIMIT" ]; then
        over_limit+="  ${lines}	${file}"$'\n'
    fi
done < <(
    find crates src e2e \
        -type d \( -name target -o -name node_modules \) -prune -o \
        -type f \( -name '*.rs' -o -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) -print 2>/dev/null
)

if [ -n "$over_limit" ]; then
    echo "These files are over the ${LIMIT}-line limit in CLAUDE.md §4:"
    echo ""
    printf '%s' "$over_limit"
    echo ""
    echo "Split them along a real seam -- a concern that belongs apart -- rather than at"
    echo "a line count. CLAUDE.md §4 and §1.11."
    exit 1
fi

echo "line limits: every source file is within ${LIMIT} lines"
