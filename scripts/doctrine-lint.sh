#!/usr/bin/env bash
# scripts/doctrine-lint — M13 Phase 1.B Step 6 doctrine regression-guard.
#
# Scans the substrate for anti-pattern phrases that violate the Koast
# Operational Doctrine (vault note: milestones/M13/koast-operational-
# doctrine.md). Catches:
#
#   Doctrine point 1: "Koast IS the operating layer."
#     Anti-patterns: agent referring to "your PMS" or "your booking
#     dashboard" as if external.
#
#   Doctrine point 2: "Never make a host look up a technical ID."
#     Anti-patterns: prompt or fixture asking the host for booking_id /
#     property_id / conversation_id directly.
#
# The system-prompt itself (src/lib/agent/system-prompt.ts) is allowed
# to mention these phrases inside the doctrine's own negated context.
# This script's regression-guard surface is EVERYTHING ELSE:
#   src/lib/agent/         except system-prompt.ts AND test files
#   src/lib/voice/         except test fixtures
#   src/app/api/agent/     except test files
#   src/components/        except test files
#   src/app/(dashboard)/   except test files
#
# Test files are excluded because they may legitimately test that the
# agent does NOT produce these phrases — asserting a negation requires
# the string literal in the assertion.
#
# Exit 0 = no violations, 1 = violations found.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Anti-pattern phrases. Case-insensitive grep. Match-word for the more
# common substrings to avoid false positives on legitimate strings.
PATTERNS=(
  "your PMS"
  "your booking dashboard"
  "find the ID"
  "please provide the booking ID"
  "please provide the property ID"
  "what is the conversation ID"
  "what is the booking ID"
  "what is the property ID"
)

# Search scope — agent + voice + dashboard surfaces.
SCOPE_PATHS=(
  "src/lib/agent"
  "src/lib/voice"
  "src/app/api/agent"
  "src/app/(dashboard)"
  "src/components"
)

# Excluded files. The doctrine and its tests are allowed to mention
# the negated phrases.
EXCLUDE_FILES=(
  "src/lib/agent/system-prompt.ts"
  "src/lib/agent/tests/system-prompt.test.ts"
  "scripts/doctrine-lint.sh"
)

EXCLUDE_PATTERNS=(
  "*.test.ts"
  "*.test.tsx"
  "__tests__"
  "tests"
  "fixtures"
)

# Build the grep exclude args.
EXCLUDE_ARGS=()
for p in "${EXCLUDE_PATTERNS[@]}"; do
  EXCLUDE_ARGS+=("--exclude=$p" "--exclude-dir=$p")
done
for f in "${EXCLUDE_FILES[@]}"; do
  EXCLUDE_ARGS+=("--exclude=$(basename "$f")")
done

found_any=0
echo "doctrine-lint — scanning ${#SCOPE_PATHS[@]} paths for ${#PATTERNS[@]} anti-pattern phrases"
echo ""

for pattern in "${PATTERNS[@]}"; do
  # -r recursive, -n line numbers, -I skip binary, -i case-insensitive
  # Use --include to limit to source files; --exclude-dir for excluded dirs.
  matches=$(grep -rniI \
    --include="*.ts" \
    --include="*.tsx" \
    --include="*.md" \
    "${EXCLUDE_ARGS[@]}" \
    -e "$pattern" \
    "${SCOPE_PATHS[@]}" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    found_any=1
    echo "VIOLATION — pattern: \"$pattern\""
    echo "$matches" | sed 's/^/  /'
    echo ""
  fi
done

if [ $found_any -eq 0 ]; then
  echo "doctrine-lint: PASS — no anti-pattern phrases found in scope."
  exit 0
else
  echo "doctrine-lint: FAIL — anti-pattern violations found above."
  echo ""
  echo "Per the M13 Phase 1.B Koast Operational Doctrine:"
  echo "  - Koast IS the operating layer (point 1 — don't say 'your PMS')"
  echo "  - Never make a host look up a technical ID (point 2)"
  echo ""
  echo "If a violation is intentional (e.g. test fixture asserting a"
  echo "refusal pattern), move the file under a __tests__/tests/fixtures"
  echo "subdirectory — those are excluded from this scan."
  exit 1
fi
