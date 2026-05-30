#!/usr/bin/env bash
# scripts/conversation-reads-guard — M13 D1 read-invariant enforcement.
#
# D1 soft-delete invariant (docs/conversation-lifecycle-spec.md, operation D1):
# "no conversation read ever returns a soft-deleted row." Enforcement: every
# read of agent_conversations goes through the notDeleted() helper in
# src/lib/agent/conversation.ts, which applies `deleted_at IS NULL`. This guard
# FAILS the build if a literal `.from("agent_conversations")` appears OUTSIDE
# the allowlist — forcing any new reader to either route through the helper or,
# for a deliberate write / non-surface read, be added here consciously.
#
# Writes (create / update last_turn_at / the DELETE that sets deleted_at) and
# the one non-surface ownership read legitimately reference the table; they
# live in the allowlisted files below. The risk this guards is a NEW SURFACE
# read elsewhere silently skipping the filter — convention becomes enforcement.
#
# Known gap (intentional): tab-visibility queries via a dynamic `from(table)`
# variable (an existence/count predicate, not a surface read), so a literal
# match can't see it; deleted-ness there is a minor non-surface nuance.
#
# Exit 0 = clean, 1 = a non-allowlisted reference found.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Files allowed to reference `from("agent_conversations")` directly:
#   - conversation.ts        : the notDeleted() helper (the ONE read scope) +
#                              the create + last_turn_at writes.
#   - artifact/route.ts      : a non-surface OWNERSHIP read (host_id join) —
#                              deleted-ness is irrelevant to artifact ownership.
#   - conversations/[id]/route.ts : the DELETE write that sets deleted_at (D1).
ALLOWLIST=(
  "src/lib/agent/conversation.ts"
  "src/app/api/agent/artifact/route.ts"
  "src/app/api/agent/conversations/[conversation_id]/route.ts"
)

matches=$(grep -rnE "from\((['\"])agent_conversations\1\)" src/ \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir="__tests__" --exclude-dir="tests" \
  --exclude="*.test.ts" --exclude="*.test.tsx" 2>/dev/null || true)

violations=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  file="${line%%:*}"
  allowed=0
  for a in "${ALLOWLIST[@]}"; do
    if [ "$file" = "$a" ]; then allowed=1; break; fi
  done
  [ "$allowed" -eq 0 ] && violations="${violations}${line}"$'\n'
done <<< "$matches"

if [ -n "$violations" ]; then
  echo "conversation-reads-guard: FAIL — agent_conversations referenced outside the allowlist:"
  printf '%s' "$violations" | sed 's/^/  /'
  echo ""
  echo "Every conversation READ must go through notDeleted() in"
  echo "src/lib/agent/conversation.ts so soft-deleted rows (M13 D1) never surface."
  echo "  - New surface read?  Route it through notDeleted()."
  echo "  - Deliberate write or non-surface ownership/existence read?"
  echo "    Add the file to ALLOWLIST in this script with a one-line rationale."
  exit 1
fi

echo "conversation-reads-guard: PASS — all agent_conversations references are allowlisted."
exit 0
