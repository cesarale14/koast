import { classifyChannel } from "../channels";

const NOW = new Date("2026-06-12T12:00:00Z").getTime();
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const base = { propertyId: "p1", channelCode: "abb", channelName: "Airbnb" };

describe("classifyChannel (P6.4)", () => {
  test("active + fresh sync → healthy", () => {
    expect(classifyChannel({ ...base, status: "active", lastSyncAt: minsAgo(10), lastError: null }, NOW).health).toBe("healthy");
  });

  test("non-active status → disconnected (the only disconnect signal)", () => {
    expect(classifyChannel({ ...base, status: "disconnected", lastSyncAt: minsAgo(5), lastError: null }, NOW).health).toBe("disconnected");
  });

  test("active + last_error → degraded (NOT disconnected — conservative)", () => {
    expect(classifyChannel({ ...base, status: "active", lastSyncAt: minsAgo(5), lastError: "token invalid" }, NOW).health).toBe("degraded");
  });

  test("active + stale sync → still healthy (staleness is informational, not health)", () => {
    // last_sync_at isn't reliably maintained by the workers, so staleness must
    // NOT drive health (it would flag every channel permanently).
    expect(classifyChannel({ ...base, status: "active", lastSyncAt: minsAgo(60 * 24 * 60), lastError: null }, NOW).health).toBe("healthy");
  });

  test("active + never synced → healthy", () => {
    expect(classifyChannel({ ...base, status: "active", lastSyncAt: null, lastError: null }, NOW).health).toBe("healthy");
  });

  test("null status is treated as active → healthy", () => {
    expect(classifyChannel({ ...base, status: null, lastSyncAt: minsAgo(5), lastError: null }, NOW).health).toBe("healthy");
  });

  test("staleMinutes is computed for the UI", () => {
    const r = classifyChannel({ ...base, status: "active", lastSyncAt: minsAgo(42), lastError: null }, NOW);
    expect(r.staleMinutes).toBe(42);
  });
});
