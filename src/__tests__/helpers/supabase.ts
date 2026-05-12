/**
 * Shared Supabase mock factory for API route tests.
 *
 * Consolidates the Supabase mock pattern used by existing route tests
 * (/api/agent/artifact, /api/agent/turn) and the M9 Phase A canonical
 * exemplar (/api/audit-feed/unread-count). Works with both server-side
 * createClient (@/lib/supabase/server) and createServiceClient
 * (@/lib/supabase/service) — the wire-up at the test boundary mocks the
 * specific module, and the client shape is identical for the auth +
 * from() surfaces used by API routes.
 *
 * Usage:
 *
 *   import { GET } from "../route";
 *   import {
 *     mockSupabaseClient,
 *     mockAuthedUser,
 *     mockSupabaseQuery,
 *   } from "@/__tests__/helpers/supabase";
 *
 *   jest.mock("@/lib/supabase/server");
 *
 *   import { createClient } from "@/lib/supabase/server";
 *
 *   test("happy path", async () => {
 *     const supabase = mockSupabaseClient();
 *     mockAuthedUser(supabase, HOST_ID);
 *     mockSupabaseQuery(supabase, "host_state", {
 *       data: { last_seen_inspect_at: "2026-05-12T00:00:00Z" },
 *       error: null,
 *     });
 *     mockSupabaseQuery(supabase, "unified_audit_feed", { count: 5, error: null });
 *     (createClient as jest.Mock).mockReturnValue(supabase);
 *
 *     const response = await GET();
 *     // assertions...
 *   });
 *
 * Chain semantics:
 *
 *   - Builder methods (.select, .eq, .gt, .limit, .order, etc.) return the
 *     chain so calls are chainable.
 *   - Terminal-row methods (.single, .maybeSingle) return Promise<result>.
 *   - The chain itself is thenable, so `await query` (used by count/head
 *     queries) resolves to the same result.
 *
 * Configure the same table twice to override (the most recent call wins).
 */

export type MockQueryResult = {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
};

export type MockSupabaseClient = ReturnType<typeof mockSupabaseClient>;

function makeChain(result: MockQueryResult) {
  const chain: Record<string, unknown> = {};
  const passthrough = (): typeof chain => chain;

  // Builder methods — return self so calls chain. Each is its own jest.fn
  // so per-call assertions remain meaningful (e.g.,
  // expect(chain.eq).toHaveBeenCalledWith("host_id", hostId)).
  chain.select = jest.fn(passthrough);
  chain.eq = jest.fn(passthrough);
  chain.neq = jest.fn(passthrough);
  chain.gt = jest.fn(passthrough);
  chain.gte = jest.fn(passthrough);
  chain.lt = jest.fn(passthrough);
  chain.lte = jest.fn(passthrough);
  chain.in = jest.fn(passthrough);
  chain.is = jest.fn(passthrough);
  chain.not = jest.fn(passthrough);
  chain.or = jest.fn(passthrough);
  chain.order = jest.fn(passthrough);
  chain.limit = jest.fn(passthrough);
  chain.range = jest.fn(passthrough);

  // Terminal-row methods — return Promise<result>.
  chain.single = jest.fn(() => Promise.resolve(result));
  chain.maybeSingle = jest.fn(() => Promise.resolve(result));

  // Make the chain itself thenable so `await query` (count/head queries)
  // resolves to the configured result. After the first await, JavaScript
  // unwraps via .then — we resolve synchronously to keep tests simple.
  chain.then = (resolve: (v: MockQueryResult) => void) => resolve(result);

  return chain;
}

export function mockSupabaseClient() {
  const fromMocks = new Map<string, ReturnType<typeof makeChain>>();
  const getUserMock = jest.fn();

  const client = {
    auth: {
      getUser: getUserMock,
    },
    from: jest.fn((table: string) => {
      if (!fromMocks.has(table)) {
        // Unconfigured tables resolve to an empty result. Tests that care
        // configure via mockSupabaseQuery before triggering the route.
        fromMocks.set(table, makeChain({ data: null, error: null }));
      }
      return fromMocks.get(table)!;
    }),
    // Internal handles for setup + assertions. Underscored to discourage
    // direct use from production code paths.
    __getUserMock: getUserMock,
    __fromMocks: fromMocks,
  };

  return client;
}

export function mockAuthedUser(
  client: MockSupabaseClient,
  userId: string,
): void {
  client.__getUserMock.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
}

export function mockUnauthed(client: MockSupabaseClient): void {
  client.__getUserMock.mockResolvedValue({
    data: { user: null },
    error: null,
  });
}

export function mockSupabaseQuery(
  client: MockSupabaseClient,
  table: string,
  result: MockQueryResult,
): void {
  client.__fromMocks.set(table, makeChain(result));
}

/**
 * Retrieve the chain for a table — useful for asserting that specific
 * builder methods were invoked with expected arguments.
 *
 *   const chain = getQueryChain(supabase, "host_state");
 *   expect(chain.eq).toHaveBeenCalledWith("host_id", HOST_ID);
 */
export function getQueryChain(
  client: MockSupabaseClient,
  table: string,
): ReturnType<typeof makeChain> {
  const chain = client.__fromMocks.get(table);
  if (!chain) {
    throw new Error(
      `No mock configured for table '${table}'. Call mockSupabaseQuery first.`,
    );
  }
  return chain;
}
