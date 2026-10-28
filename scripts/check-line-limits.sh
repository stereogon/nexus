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
    find crates src \
        -type d \( -name target -o -name node_modules \) -prune -o \
        -type f \( -name '*.rs' -o -name '*.ts' -o -name '*.tsx' \) -print 2>/dev/null
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
