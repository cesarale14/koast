import { navGroups, isNavItemActive } from "../nav-config";
import { STATIC_ROUTES } from "@/lib/cmdk/static";

describe("isNavItemActive", () => {
  describe("Home (`/`) — active across the whole chat-primary surface", () => {
    it.each(["/", "/chat", "/chat/abc-123"])(
      "is active on chat-primary path %s",
      (path) => {
        expect(isNavItemActive("/", path)).toBe(true);
      },
    );

    it.each(["/calendar", "/properties", "/pricing", "", null, undefined])(
      "is NOT active on non-chat-primary path %s",
      (path) => {
        expect(isNavItemActive("/", path as string | null)).toBe(false);
      },
    );
  });

  describe("inspect tabs — prefix match", () => {
    it("matches the exact route and nested sub-routes", () => {
      expect(isNavItemActive("/calendar", "/calendar")).toBe(true);
      expect(isNavItemActive("/calendar", "/calendar/2026-06")).toBe(true);
      expect(isNavItemActive("/properties", "/properties/abc")).toBe(true);
    });

    it("does not cross-match a different tab or the root", () => {
      expect(isNavItemActive("/calendar", "/comp-sets")).toBe(false);
      expect(isNavItemActive("/pricing", "/properties")).toBe(false);
      expect(isNavItemActive("/calendar", "/")).toBe(false);
      expect(isNavItemActive("/calendar", null)).toBe(false);
    });
  });
});

describe("navGroups", () => {
  const allItems = navGroups.flatMap((g) => g.items);

  it("opens with Home → `/` (label alignment so `/` isn't two names)", () => {
    expect(navGroups[0].items[0]).toMatchObject({ name: "Home", href: "/" });
    // The old "Dashboard" label must not regress.
    expect(allItems.some((i) => i.name === "Dashboard")).toBe(false);
  });

  it("has unique hrefs", () => {
    const hrefs = allItems.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("every sidebar tab is reachable from the command palette (no drift)", () => {
    const paletteHrefs = new Set(STATIC_ROUTES.map((r) => r.href));
    for (const item of allItems) {
      expect(paletteHrefs.has(item.href)).toBe(true);
    }
  });
});
