import { verifyCleanerToken } from "../verify";

// Minimal chain mock: from().select().eq().eq().limit() resolves to { data }.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockSupabase(row: any | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    limit: async () => ({ data: row ? [row] : [] }),
  };
  return { from: () => chain };
}

describe("verifyCleanerToken (P6.3)", () => {
  const base = { id: "t1", property_id: "p1" };

  test("valid token, no expiry/invalidation → ok", async () => {
    const r = await verifyCleanerToken(mockSupabase({ ...base }), "t1", "tok", "id, property_id");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.id).toBe("t1");
  });

  test("no matching row → 403", async () => {
    const r = await verifyCleanerToken(mockSupabase(null), "t1", "wrong", "id");
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  test("invalidated token → 403", async () => {
    const r = await verifyCleanerToken(
      mockSupabase({ ...base, token_invalidated_at: new Date().toISOString() }),
      "t1", "tok", "id",
    );
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  test("expired token (past) → 403", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const r = await verifyCleanerToken(mockSupabase({ ...base, token_expires_at: past }), "t1", "tok", "id");
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  test("future expiry → ok", async () => {
    const future = new Date(Date.now() + 100_000).toISOString();
    const r = await verifyCleanerToken(mockSupabase({ ...base, token_expires_at: future }), "t1", "tok", "id");
    expect(r.ok).toBe(true);
  });

  test("missing taskId or token → 403 (no query)", async () => {
    const r = await verifyCleanerToken(mockSupabase({ ...base }), "", "", "id");
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
});
