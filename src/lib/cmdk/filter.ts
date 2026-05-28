/**
 * Cmd+K — fuzzy-light filter.
 *
 * Substring + token-prefix match, no external library. Per the M13
 * Phase 1.B STOP: at ~50–100 indexed entries (properties + routes +
 * actions + recent-20 conversations), plain matching hits the <100ms
 * budget easily without a dependency, AND the field-expansion approach
 * already covers "tampa → Villa Jamaica" + "jamaica st → Villa Jamaica"
 * natively. Typo tolerance is not a Phase 1.B requirement; revisit
 * fuse.js when fleet sizes warrant.
 *
 * Ranking — applied AFTER the matched set is identified:
 *   1. Exact label match (case-insensitive) ranks highest.
 *   2. Token-prefix on the primary keyword (entry.keywords[0]) next.
 *   3. Substring match on any keyword next.
 *   4. Ties broken by kind preference: properties > routes >
 *      conversations > actions (configurable below). Properties first
 *      reflects the doctrine — natural references first; the host
 *      thinks in property names, not route names.
 *
 * Empty query → return the unfiltered list ordered by kind preference
 * (so the palette can show a useful "default" view before the host
 * types).
 */

import type { CmdKEntry, CmdKKind } from "./types";

const KIND_PRIORITY: Record<CmdKKind, number> = {
  property: 0,
  route: 1,
  conversation: 2,
  action: 3,
};

/** Lowercase a string once; used inside the hot loop. */
function lc(s: string): string {
  return s.toLowerCase();
}

/** True iff `haystack` (already lowercased) contains the lowercased
 * query as a substring. */
function substringMatch(haystackLc: string, queryLc: string): boolean {
  return haystackLc.indexOf(queryLc) >= 0;
}

/**
 * True iff any whitespace-separated token in `haystack` starts with the
 * query (case-insensitive). "tampa" matches "Cozy Loft - Tampa" via the
 * "Tampa" token but NOT via the "Cozy" token. Token splitting is naive
 * (whitespace + hyphen) — sufficient for property names + addresses +
 * route labels.
 */
function tokenPrefixMatch(haystackLc: string, queryLc: string): boolean {
  // Hot path: skip the split if a plain substring isn't even present.
  if (haystackLc.indexOf(queryLc) < 0) return false;
  // Tokenize on whitespace, hyphens, and forward-slashes (routes).
  const tokens = haystackLc.split(/[\s\-/]+/);
  for (const t of tokens) {
    if (t.startsWith(queryLc)) return true;
  }
  return false;
}

/** Score one entry against the lowercased query. Higher is better.
 * 0 = no match. Caller filters out zeros. */
function scoreEntry(entry: CmdKEntry, queryLc: string): number {
  const labelLc = lc(entry.label);

  // Tier 1 — exact label match.
  if (labelLc === queryLc) return 1000;

  // Tier 2 — token-prefix on the primary keyword (entry.keywords[0]).
  const primaryLc = entry.keywords.length > 0 ? lc(entry.keywords[0]) : labelLc;
  if (tokenPrefixMatch(primaryLc, queryLc)) return 100;

  // Tier 3 — token-prefix on any keyword (including label).
  if (tokenPrefixMatch(labelLc, queryLc)) return 75;
  for (let i = 1; i < entry.keywords.length; i++) {
    if (tokenPrefixMatch(lc(entry.keywords[i]), queryLc)) return 50;
  }

  // Tier 4 — substring match on any keyword.
  if (substringMatch(labelLc, queryLc)) return 25;
  for (const kw of entry.keywords) {
    if (substringMatch(lc(kw), queryLc)) return 15;
  }

  return 0;
}

/**
 * Filter entries against a query. Empty/whitespace-only query returns
 * the entries ordered by kind priority (no scoring). Non-empty query
 * filters out zero-score entries and ranks by (score desc, kind
 * priority asc, label asc).
 *
 * Performance contract per M13 Phase 1.B doctrine point 7 ("anything
 * that takes a sentence in chat should take a tap from the shell")
 * + the fluidity budgets manifest (cmd_k_first_result < 100ms):
 * this function must return for any query against a 300-entry index
 * in under 100ms on a developer-class machine. Perf assertion lives
 * in __tests__/filter.perf.test.ts.
 */
export function filterEntries(
  entries: CmdKEntry[],
  query: string,
): CmdKEntry[] {
  const trimmed = query.trim();
  if (trimmed === "") {
    // Default view — kind priority, then label A-Z within each kind.
    return [...entries].sort((a, b) => {
      const kindDiff = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
      if (kindDiff !== 0) return kindDiff;
      return a.label.localeCompare(b.label);
    });
  }

  const qLc = lc(trimmed);
  const scored: Array<{ entry: CmdKEntry; score: number }> = [];
  for (const entry of entries) {
    const score = scoreEntry(entry, qLc);
    if (score > 0) scored.push({ entry, score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    const kindDiff =
      KIND_PRIORITY[a.entry.kind] - KIND_PRIORITY[b.entry.kind];
    if (kindDiff !== 0) return kindDiff;
    return a.entry.label.localeCompare(b.entry.label);
  });

  return scored.map((s) => s.entry);
}
