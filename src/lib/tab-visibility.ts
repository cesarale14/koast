/**
 * Tab visibility — M8 C6 (D12).
 *
 * Pure helpers for the ConditionalTabStrip in the dashboard layout.
 *
 * Doctrine binding (D12):
 *   - Dashboard / Properties / Messages / Pricing are always visible
 *     (substrate-required).
 *   - Calendar / Reviews / Turnovers / Market Intel / Comp Sets are
 *     visible only when their per-tab predicate is true.
 *   - Hidden tabs are silently absent from nav — no greyed-out treatment,
 *     no "Coming soon" tooltip, no "New!" badge on first appearance.
 *   - Frontdesk was removed in Phase B C7; not represented here.
 *
 * The shape is decoupled from the layout's `NavItem` so this module can
 * be unit-tested without pulling React/lucide-react.
 */

export type ConditionalTabKey = "calendar" | "reviews" | "turnovers" | "market_intel" | "comp_sets";

export type TabVisibility = Record<ConditionalTabKey, boolean>;

/** Empty visibility — all conditional tabs hidden. Initial render state
 *  before the predicate fetch resolves (no localStorage cache). */
export const EMPTY_TAB_VISIBILITY: TabVisibility = {
  calendar: false,
  reviews: false,
  turnovers: false,
  market_intel: false,
  comp_sets: false,
};

/** Map from nav-item href (as defined in layout.tsx's navGroups) to the
 *  conditional tab key. Always-visible items are absent — `isTabVisible`
 *  treats absence as "always visible". */
export const HREF_TO_CONDITIONAL_KEY: Readonly<Record<string, ConditionalTabKey>> = {
  "/calendar": "calendar",
  "/reviews": "reviews",
  "/turnovers": "turnovers",
  "/market-intel": "market_intel",
  "/comp-sets": "comp_sets",
};

/** Determine whether a tab at `href` should render given the current
 *  visibility map. Always-visible tabs (no entry in
 *  HREF_TO_CONDITIONAL_KEY) return true unconditionally. */
export function isTabVisible(href: string, visibility: TabVisibility): boolean {
  const key = HREF_TO_CONDITIONAL_KEY[href];
  if (!key) return true;
  return Boolean(visibility[key]);
}

interface NavItemLike {
  href: string;
}
interface NavGroupLike<I extends NavItemLike> {
  label?: string;
  items: I[];
}

/**
 * Filter a navGroups list by visibility, preserving group order + group
 * labels even when all items inside a group are hidden. (The dashboard
 * layout collapses empty groups visually via CSS, not by removing the
 * group; matches the substrate-vs-presentation discipline.)
 */
export function filterNavGroupsByVisibility<I extends NavItemLike, G extends NavGroupLike<I>>(
  groups: G[],
  visibility: TabVisibility,
): G[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => isTabVisible(item.href, visibility)),
  }));
}

/* ---------- localStorage hydration ---------- */

export const TAB_VISIBILITY_LOCALSTORAGE_KEY = "koast.tabVisibility.v1";
export const TAB_VISIBILITY_TTL_MS = 24 * 60 * 60 * 1000; // 24h per C6 sign-off R-6

export interface TabVisibilityCache {
  visibility: TabVisibility;
  fetched_at: number; // epoch ms
}

/** Parse a localStorage payload into a {visibility, fetched_at}, returning
 *  null when the shape is malformed, the TTL has expired, or the key is
 *  absent. Pure helper — no I/O. */
export function parseTabVisibilityCache(raw: string | null, now: number = Date.now()): TabVisibility | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Partial<TabVisibilityCache>;
  if (typeof obj.fetched_at !== "number" || !Number.isFinite(obj.fetched_at)) return null;
  if (now - obj.fetched_at > TAB_VISIBILITY_TTL_MS) return null;
  const v = obj.visibility;
  if (!v || typeof v !== "object") return null;
  // Coerce + drop unknown keys; missing keys default to false.
  const out: TabVisibility = { ...EMPTY_TAB_VISIBILITY };
  for (const k of Object.keys(EMPTY_TAB_VISIBILITY) as ConditionalTabKey[]) {
    if (typeof (v as Record<string, unknown>)[k] === "boolean") {
      out[k] = (v as Record<string, boolean>)[k];
    }
  }
  return out;
}

export function serializeTabVisibilityCache(visibility: TabVisibility, now: number = Date.now()): string {
  const payload: TabVisibilityCache = { visibility, fetched_at: now };
  return JSON.stringify(payload);
}
