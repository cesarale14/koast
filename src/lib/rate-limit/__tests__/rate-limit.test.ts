import { rateLimit, clientIp } from "../index";

const future = () => new Date(Date.now() + 60_000).toISOString();

describe("rateLimit (P6.3)", () => {
  test("allows when under the limit", async () => {
    const supabase = { rpc: async () => ({ data: [{ allowed: true, current_count: 1, reset_at: future() }], error: null }) };
    const r = await rateLimit(supabase, { key: "k", limit: 5, windowSec: 60 });
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(1);
  });

  test("blocks when over the limit, with a positive Retry-After", async () => {
    const supabase = { rpc: async () => ({ data: [{ allowed: false, current_count: 6, reset_at: future() }], error: null }) };
    const r = await rateLimit(supabase, { key: "k", limit: 5, windowSec: 60 });
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  test("fails OPEN when the rpc returns an error", async () => {
    const supabase = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
    const r = await rateLimit(supabase, { key: "k", limit: 5, windowSec: 60 });
    expect(r.allowed).toBe(true);
  });

  test("fails OPEN when the rpc throws", async () => {
    const supabase = { rpc: () => { throw new Error("no rpc"); } };
    const r = await rateLimit(supabase, { key: "k", limit: 5, windowSec: 60 });
    expect(r.allowed).toBe(true);
  });
});

describe("clientIp", () => {
  test("takes the first x-forwarded-for hop", () => {
    const req = new Request("https://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  test("falls back to a constant when no ip header", () => {
    const req = new Request("https://x");
    expect(clientIp(req)).toBe("unknown");
  });
});
