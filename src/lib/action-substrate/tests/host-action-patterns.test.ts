/**
 * Unit tests for host-action-patterns — M11 Phase B item 1 (F8 substrate).
 *
 * Mocks createServiceClient at the module boundary; exercises the
 * writer (recordHostActionPattern) + reader-stub (readPatternsForHost).
 * Mirrors the audit-writer.test.ts mock pattern for consistency.
 */

import { recordHostActionPattern, readPatternsForHost } from "../host-action-patterns";

jest.mock("@/lib/supabase/service");

import { createServiceClient } from "@/lib/supabase/service";

interface MockBuilder {
  insert: jest.Mock;
  select: jest.Mock;
  single: jest.Mock;
  eq: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
}

function makeInsertBuilder(opts: {
  insertResult: { data?: unknown; error?: { message: string } | null };
}): MockBuilder {
  const builder: MockBuilder = {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn(() => Promise.resolve(opts.insertResult)),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  };
  return builder;
}

function makeReadBuilder(opts: {
  rows: unknown[] | null;
  error?: { message: string } | null;
}): { builder: MockBuilder; resolveLimit: () => Promise<{ data: unknown; error: unknown }> } {
  const result = Promise.resolve({ data: opts.rows ?? null, error: opts.error ?? null });
  const builder: MockBuilder = {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    // .limit returns the result (awaitable; the supabase chain resolves
    // on the terminal call). Our writer calls .limit(N) without further
    // chaining; tests await on the implicit thenable.
    limit: jest.fn().mockReturnValue(result),
  };
  return { builder, resolveLimit: () => result };
}

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const AUDIT_LOG_ID = "11111111-1111-1111-1111-111111111111";
const PATTERN_ID = "22222222-2222-2222-2222-222222222222";
const CREATED_AT = "2026-05-25T08:00:00+00:00";

describe("recordHostActionPattern", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("inserts a row with the supplied columns and returns id + created_at", async () => {
    const builder = makeInsertBuilder({
      insertResult: { data: { id: PATTERN_ID, created_at: CREATED_AT }, error: null },
    });
    (createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue(builder),
    });

    const result = await recordHostActionPattern({
      host_id: HOST_ID,
      action_type: "write_memory_fact",
      outcome: "confirmed",
      payload_summary: { sub_entity_type: "wifi", attribute: "password" },
      agent_audit_log_id: AUDIT_LOG_ID,
    });

    expect(result).toEqual({ pattern_id: PATTERN_ID, created_at: CREATED_AT });
    expect(builder.insert).toHaveBeenCalledTimes(1);
    const inserted = builder.insert.mock.calls[0][0];
    expect(inserted.host_id).toBe(HOST_ID);
    expect(inserted.action_type).toBe("write_memory_fact");
    expect(inserted.outcome).toBe("confirmed");
    expect(inserted.payload_summary).toEqual({ sub_entity_type: "wifi", attribute: "password" });
    expect(inserted.agent_audit_log_id).toBe(AUDIT_LOG_ID);
  });

  test("payload_summary defaults to {} when omitted", async () => {
    const builder = makeInsertBuilder({
      insertResult: { data: { id: PATTERN_ID, created_at: CREATED_AT }, error: null },
    });
    (createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue(builder),
    });

    await recordHostActionPattern({
      host_id: HOST_ID,
      action_type: "write_memory_fact",
      outcome: "dismissed",
    });

    const inserted = builder.insert.mock.calls[0][0];
    expect(inserted.payload_summary).toEqual({});
    expect(inserted.agent_audit_log_id).toBeNull();
  });

  test("handles 'modified' outcome (host edited then approved)", async () => {
    const builder = makeInsertBuilder({
      insertResult: { data: { id: PATTERN_ID, created_at: CREATED_AT }, error: null },
    });
    (createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue(builder),
    });

    await recordHostActionPattern({
      host_id: HOST_ID,
      action_type: "propose_guest_message",
      outcome: "modified",
      payload_summary: { booking_id: "bk-1", edited: true },
    });

    const inserted = builder.insert.mock.calls[0][0];
    expect(inserted.outcome).toBe("modified");
    expect(inserted.payload_summary).toEqual({ booking_id: "bk-1", edited: true });
  });

  test("throws when the insert returns an error", async () => {
    const builder = makeInsertBuilder({
      insertResult: { data: null, error: { message: "RLS denied insert" } },
    });
    (createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue(builder),
    });

    await expect(
      recordHostActionPattern({
        host_id: HOST_ID,
        action_type: "write_memory_fact",
        outcome: "confirmed",
      }),
    ).rejects.toThrow(/RLS denied insert/);
  });

  test("throws when no row returned despite no error", async () => {
    const builder = makeInsertBuilder({
      insertResult: { data: null, error: null },
    });
    (createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue(builder),
    });

    await expect(
      recordHostActionPattern({
        host_id: HOST_ID,
        action_type: "write_memory_fact",
        outcome: "confirmed",
      }),
    ).rejects.toThrow(/no row returned/);
  });
});

describe("readPatternsForHost (Phase 2-ready stub)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns rows ordered by created_at DESC (default limit=50)", async () => {
    const rows = [
      {
        id: PATTERN_ID,
        host_id: HOST_ID,
        action_type: "write_memory_fact",
        outcome: "confirmed",
        payload_summary: {},
        agent_audit_log_id: null,
        created_at: CREATED_AT,
      },
    ];
    const { builder } = makeReadBuilder({ rows });
    (createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue(builder),
    });

    const result = await readPatternsForHost(HOST_ID, "write_memory_fact");

    expect(result).toEqual(rows);
    expect(builder.eq).toHaveBeenNthCalledWith(1, "host_id", HOST_ID);
    expect(builder.eq).toHaveBeenNthCalledWith(2, "action_type", "write_memory_fact");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(50);
  });

  test("respects custom limit", async () => {
    const { builder } = makeReadBuilder({ rows: [] });
    (createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue(builder),
    });

    await readPatternsForHost(HOST_ID, "propose_guest_message", 10);

    expect(builder.limit).toHaveBeenCalledWith(10);
  });

  test("returns empty array when DB returns null data", async () => {
    const { builder } = makeReadBuilder({ rows: null });
    (createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue(builder),
    });

    const result = await readPatternsForHost(HOST_ID, "write_memory_fact");
    expect(result).toEqual([]);
  });

  test("throws when the select returns an error", async () => {
    const { builder } = makeReadBuilder({
      rows: null,
      error: { message: "permission denied" },
    });
    (createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue(builder),
    });

    await expect(
      readPatternsForHost(HOST_ID, "write_memory_fact"),
    ).rejects.toThrow(/permission denied/);
  });
});
