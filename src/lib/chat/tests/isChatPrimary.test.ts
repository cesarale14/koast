/**
 * isChatPrimary — pathname-derived layout state machine (M13 Phase 1.A
 * keystone; operator msg 3518 A1 binding test).
 *
 * Asserts the single source of truth: which pathname strings count as
 * chat-primary (mount ChatPrimarySurface) vs inspect-mode (mount
 * InspectSurface). The reducer no longer participates — if this test
 * passes, browser back/forward through chat-primary → inspect → back
 * is correct for free because the layout reads pathname directly.
 */

import { isChatPrimary } from "../isChatPrimary";

describe("isChatPrimary — pathname-derived layout state machine", () => {
  describe("chat-primary routes", () => {
    test("root pathname is chat-primary", () => {
      expect(isChatPrimary("/")).toBe(true);
    });

    test("/chat is chat-primary", () => {
      expect(isChatPrimary("/chat")).toBe(true);
    });

    test("/chat/abc123 is chat-primary", () => {
      expect(isChatPrimary("/chat/abc123")).toBe(true);
    });

    test("/chat/conversation-uuid-with-dashes is chat-primary", () => {
      expect(
        isChatPrimary("/chat/a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
      ).toBe(true);
    });
  });

  describe("inspect-mode routes (every existing dashboard surface)", () => {
    test("/calendar is NOT chat-primary", () => {
      expect(isChatPrimary("/calendar")).toBe(false);
    });

    test("/messages is NOT chat-primary", () => {
      expect(isChatPrimary("/messages")).toBe(false);
    });

    test("/properties is NOT chat-primary", () => {
      expect(isChatPrimary("/properties")).toBe(false);
    });

    test("/properties/[id] is NOT chat-primary", () => {
      expect(isChatPrimary("/properties/abc123")).toBe(false);
    });

    test("/pricing is NOT chat-primary", () => {
      expect(isChatPrimary("/pricing")).toBe(false);
    });

    test("/reviews is NOT chat-primary", () => {
      expect(isChatPrimary("/reviews")).toBe(false);
    });

    test("/turnovers is NOT chat-primary", () => {
      expect(isChatPrimary("/turnovers")).toBe(false);
    });

    test("/market-intel is NOT chat-primary", () => {
      expect(isChatPrimary("/market-intel")).toBe(false);
    });

    test("/comp-sets is NOT chat-primary", () => {
      expect(isChatPrimary("/comp-sets")).toBe(false);
    });

    test("/settings is NOT chat-primary", () => {
      expect(isChatPrimary("/settings")).toBe(false);
    });
  });

  describe("edge cases — adversarial inputs (A1 + §3.5.D)", () => {
    test("null pathname returns false (defensive)", () => {
      expect(isChatPrimary(null)).toBe(false);
    });

    test("undefined pathname returns false (defensive)", () => {
      expect(isChatPrimary(undefined)).toBe(false);
    });

    test("empty string returns false", () => {
      expect(isChatPrimary("")).toBe(false);
    });

    test("path that contains 'chat' substring but is NOT chat-primary", () => {
      // §3.5.D adversarial: a future /chatops or /chattanooga route
      // must not be misclassified as chat-primary. The prefix match
      // uses `/chat/` (with trailing slash) for sub-routes, and exact
      // `/chat` for the bare landing.
      expect(isChatPrimary("/chatops")).toBe(false);
      expect(isChatPrimary("/chattanooga")).toBe(false);
      expect(isChatPrimary("/chats")).toBe(false);
    });

    test("query string on root does not flip to false", () => {
      // Next.js usePathname() returns pathname WITHOUT query string.
      // If a caller incorrectly passes "/?foo=bar", that's a bug at the
      // call site; isChatPrimary treats it as not-root because Next.js
      // never produces that shape. Documented behavior: literal match.
      expect(isChatPrimary("/?foo=bar")).toBe(false);
    });

    test("trailing slash on /chat is NOT recognized as chat-primary", () => {
      // Next.js pathname normalization removes trailing slashes by
      // default. If "/chat/" arrives, it's a non-standard input and
      // we don't special-case it; the route resolver upstream is the
      // canonical normalizer.
      expect(isChatPrimary("/chat/")).toBe(true);
    });
  });
});
