/**
 * Pure-helper unit tests for F9 (M8 Phase C).
 *
 * Integration tests against Supabase deferred per Round-2 #8 (API
 * route test infrastructure). The query-building portion of
 * listAuditFeedEvents is exercised manually via staging verification.
 */

import {
  categoriesForFilter,
  decodeCursor,
  encodeCursor,
  type AuditFeedCursor,
  type AuditFeedFilter,
} from "../audit-feed";

describe("encodeCursor / decodeCursor — round-trip", () => {
  test("standard cursor round-trips exactly", () => {
    const cursor: AuditFeedCursor = {
      occurred_at: "2026-05-08T18:30:00.123456+00:00",
      source_id: "4d52bb8c-5bee-479a-81ae-2d0a9cb02785",
    };
    const encoded = encodeCursor(cursor);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  test("encoded cursor is base64 (opaque to clients)", () => {
    const encoded = encodeCursor({
      occurred_at: "2026-05-08T18:30:00Z",
      source_id: "abc",
    });
    // base64 alphabet only (A-Za-z0-9+/=)
    expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  test("decodeCursor rejects non-base64 garbage", () => {
    expect(() => decodeCursor("definitely-not-base64-json!!!")).toThrow();
  });

  test("decodeCursor rejects valid base64 with wrong shape", () => {
    const encoded = Buffer.from(JSON.stringify({ foo: "bar" })).toString(
      "base64",
    );
    expect(() => decodeCursor(encoded)).toThrow(/Invalid cursor/);
  });

  test("decodeCursor rejects valid base64 missing source_id", () => {
    const encoded = Buffer.from(
      JSON.stringify({ occurred_at: "2026-05-08T00:00:00Z" }),
    ).toString("base64");
    expect(() => decodeCursor(encoded)).toThrow(/Invalid cursor/);
  });
});

describe("categoriesForFilter — D17b chip → category fold", () => {
  test("all → null (no filter)", () => {
    expect(categoriesForFilter("all")).toBeNull();
  });

  test("memory → ['memory_write']", () => {
    expect(categoriesForFilter("memory")).toEqual(["memory_write"]);
  });

  test("messages → ['guest_message']", () => {
    expect(categoriesForFilter("messages")).toEqual(["guest_message"]);
  });

  test("pricing → ['rate_push', 'pricing_outcome']", () => {
    // Pricing chip surfaces both rate-push writes (Channex) and
    // applied-rec outcomes per conventions v1.2.
    expect(categoriesForFilter("pricing")).toEqual([
      "rate_push",
      "pricing_outcome",
    ]);
  });

  test("sms → ['sms']", () => {
    // M8 chip is honest about its content; M9 extends to ['sms',
    // 'notification'] when notifications source rejoins the VIEW.
    expect(categoriesForFilter("sms")).toEqual(["sms"]);
  });

  test("all five chips covered (exhaustiveness sanity)", () => {
    const chips: AuditFeedFilter[] = [
      "all",
      "memory",
      "messages",
      "pricing",
      "sms",
    ];
    for (const chip of chips) {
      const result = categoriesForFilter(chip);
      expect(result === null || Array.isArray(result)).toBe(true);
    }
  });
});
