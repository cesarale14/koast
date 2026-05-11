/**
 * tab-visibility.ts — M8 C6 helpers.
 *
 * Locked test list per C6 sign-off (Telegram message 2763):
 *   1. Empty visibility → only always-visible tabs render
 *   2. All-true visibility → all 9 tabs render
 *   3. Only Calendar+Reviews true → 4 always + 2 conditional, ordering preserved
 *   4. localStorage hydration shape round-trips
 *   5. Unknown tab key in visibility map ignored gracefully
 *   6. Group structure (no-label / MANAGE / INSIGHTS) preserved through filter
 */

import {
  EMPTY_TAB_VISIBILITY,
  HREF_TO_CONDITIONAL_KEY,
  TAB_VISIBILITY_TTL_MS,
  filterNavGroupsByVisibility,
  isTabVisible,
  parseTabVisibilityCache,
  serializeTabVisibilityCache,
  type TabVisibility,
} from "../tab-visibility";

// Mirror of layout.tsx's navGroups shape (href + name minimum surface)
const NAV_GROUPS_FIXTURE = [
  {
    items: [
      { name: "Dashboard", href: "/" },
      { name: "Calendar", href: "/calendar" },
      { name: "Messages", href: "/messages" },
    ],
  },
  {
    label: "MANAGE",
    items: [
      { name: "Properties", href: "/properties" },
      { name: "Pricing", href: "/pricing" },
      { name: "Reviews", href: "/reviews" },
      { name: "Turnovers", href: "/turnovers" },
    ],
  },
  {
    label: "INSIGHTS",
    items: [
      { name: "Market Intel", href: "/market-intel" },
      { name: "Comp Sets", href: "/comp-sets" },
    ],
  },
];

describe("filterNavGroupsByVisibility — locked test list", () => {
  test("1. empty visibility → only always-visible tabs render", () => {
    const filtered = filterNavGroupsByVisibility(NAV_GROUPS_FIXTURE, EMPTY_TAB_VISIBILITY);
    const hrefs = filtered.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toEqual(["/", "/messages", "/properties", "/pricing"]);
  });

  test("2. all-true visibility → all 9 tabs render", () => {
    const allTrue: TabVisibility = {
      calendar: true,
      reviews: true,
      turnovers: true,
      market_intel: true,
      comp_sets: true,
    };
    const filtered = filterNavGroupsByVisibility(NAV_GROUPS_FIXTURE, allTrue);
    const hrefs = filtered.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toEqual([
      "/",
      "/calendar",
      "/messages",
      "/properties",
      "/pricing",
      "/reviews",
      "/turnovers",
      "/market-intel",
      "/comp-sets",
    ]);
  });

  test("3. only calendar+reviews true → 4 always + 2 conditional, ordering preserved", () => {
    const partial: TabVisibility = {
      calendar: true,
      reviews: true,
      turnovers: false,
      market_intel: false,
      comp_sets: false,
    };
    const filtered = filterNavGroupsByVisibility(NAV_GROUPS_FIXTURE, partial);
    const hrefs = filtered.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toEqual(["/", "/calendar", "/messages", "/properties", "/pricing", "/reviews"]);
  });

  test("6. group structure (no-label / MANAGE / INSIGHTS) preserved through filter", () => {
    const partial: TabVisibility = {
      ...EMPTY_TAB_VISIBILITY,
      calendar: true,
    };
    const filtered = filterNavGroupsByVisibility(NAV_GROUPS_FIXTURE, partial);
    // Three groups even though INSIGHTS is empty — group identity preserved.
    expect(filtered).toHaveLength(3);
    expect(filtered[0].label).toBeUndefined();
    expect(filtered[1].label).toBe("MANAGE");
    expect(filtered[2].label).toBe("INSIGHTS");
    expect(filtered[2].items).toEqual([]); // INSIGHTS group rendered with zero items
  });
});

describe("isTabVisible — always-visible tabs unaffected by visibility map", () => {
  test("always-visible hrefs return true even when map is empty", () => {
    for (const href of ["/", "/properties", "/messages", "/pricing"]) {
      expect(isTabVisible(href, EMPTY_TAB_VISIBILITY)).toBe(true);
    }
  });

  test("conditional hrefs follow visibility map", () => {
    expect(isTabVisible("/calendar", EMPTY_TAB_VISIBILITY)).toBe(false);
    expect(isTabVisible("/calendar", { ...EMPTY_TAB_VISIBILITY, calendar: true })).toBe(true);
  });

  test("HREF_TO_CONDITIONAL_KEY mapping matches D12 conditional set", () => {
    expect(Object.keys(HREF_TO_CONDITIONAL_KEY).sort()).toEqual([
      "/calendar",
      "/comp-sets",
      "/market-intel",
      "/reviews",
      "/turnovers",
    ]);
  });
});

describe("parseTabVisibilityCache / serialize round-trip", () => {
  test("4. round-trip preserves visibility", () => {
    const v: TabVisibility = {
      calendar: true,
      reviews: false,
      turnovers: true,
      market_intel: false,
      comp_sets: true,
    };
    const now = 1_700_000_000_000;
    const serialized = serializeTabVisibilityCache(v, now);
    const parsed = parseTabVisibilityCache(serialized, now);
    expect(parsed).toEqual(v);
  });

  test("malformed JSON → null (no throw)", () => {
    expect(parseTabVisibilityCache("not json")).toBeNull();
    expect(parseTabVisibilityCache(null)).toBeNull();
    expect(parseTabVisibilityCache("")).toBeNull();
    expect(parseTabVisibilityCache("null")).toBeNull();
  });

  test("missing fetched_at → null", () => {
    expect(
      parseTabVisibilityCache(
        JSON.stringify({ visibility: { ...EMPTY_TAB_VISIBILITY, calendar: true } }),
      ),
    ).toBeNull();
  });

  test("expired TTL → null", () => {
    const now = 1_700_000_000_000;
    const stale = serializeTabVisibilityCache(EMPTY_TAB_VISIBILITY, now - TAB_VISIBILITY_TTL_MS - 1);
    expect(parseTabVisibilityCache(stale, now)).toBeNull();
  });

  test("5. unknown tab keys ignored gracefully (drop), missing keys default false", () => {
    const now = 1_700_000_000_000;
    const raw = JSON.stringify({
      visibility: { calendar: true, frontdesk: true, comp_sets: true }, // frontdesk is unknown post-C7
      fetched_at: now,
    });
    const parsed = parseTabVisibilityCache(raw, now);
    expect(parsed).toEqual({
      calendar: true,
      reviews: false,
      turnovers: false,
      market_intel: false,
      comp_sets: true,
    });
    // Note: `frontdesk` did not leak into the returned shape.
    expect((parsed as unknown as Record<string, unknown>).frontdesk).toBeUndefined();
  });

  test("non-boolean visibility values coerced to false (defensive)", () => {
    const now = 1_700_000_000_000;
    const raw = JSON.stringify({
      visibility: { calendar: "yes", reviews: 1, turnovers: null },
      fetched_at: now,
    });
    const parsed = parseTabVisibilityCache(raw, now);
    expect(parsed).toEqual(EMPTY_TAB_VISIBILITY);
  });
});
