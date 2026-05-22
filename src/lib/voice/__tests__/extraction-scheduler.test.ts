/**
 * Voice extraction scheduler — unit tests for the K1 shared handler.
 * M10 Phase E STEP 5.
 *
 * Mocks `extractVoiceForHost` at the module boundary so the scheduler's
 * orchestration is tested in isolation. The actual extractor is M9 Phase E
 * substrate; tests do not exercise its logic.
 *
 * Coverage (5 tests):
 *   1. Host iteration: N hosts → extractor invoked N times; summary.hosts_processed=N
 *   2. Per-host failure isolation: middle host throws → flanking hosts still processed
 *      + hosts_error increments + errors[] captures the failure + run completes
 *      without re-throw
 *   3. Result-variant aggregation: mixed 'extracted'/'no_change'/'insufficient_samples'
 *      tally correctly to their summary buckets
 *   4. Empty host set: zero hosts → summary all-zeros, no error
 *   5. DISTINCT enumeration: duplicate user_id rows in properties → deduplicated
 *      to unique host_ids (Set-based)
 *
 * 5 tests; 724 → 729.
 */

jest.mock("@/lib/voice/extraction-worker", () => ({
  __esModule: true,
  extractVoiceForHost: jest.fn(),
}));

import { runExtractionForAllHosts } from "@/lib/voice/extraction-scheduler";
import { extractVoiceForHost } from "@/lib/voice/extraction-worker";

const mockExtract = extractVoiceForHost as jest.MockedFunction<
  typeof extractVoiceForHost
>;

/** Build a minimal supabase mock whose `.from('properties').select('user_id')`
 *  returns the given user_id rows. Other table calls fall through to a no-op
 *  (the scheduler only queries properties for enumeration; per-host extractor
 *  is mocked above so doesn't touch supabase). */
function makeSupabaseMock(propertyRows: Array<{ user_id: string | null }>) {
  return {
    from: jest.fn((table: string) => {
      if (table === "properties") {
        return {
          select: jest.fn().mockResolvedValue({ data: propertyRows, error: null }),
        };
      }
      // Defensive fallback for any unexpected table read.
      return {
        select: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("runExtractionForAllHosts — K1 shared handler", () => {
  test("iterates over distinct hosts; hosts_processed matches count", async () => {
    const supabase = makeSupabaseMock([
      { user_id: "host-1" },
      { user_id: "host-2" },
      { user_id: "host-3" },
    ]);
    mockExtract.mockResolvedValue({ status: "extracted", sample_count: 50 });

    const summary = await runExtractionForAllHosts(supabase);

    expect(mockExtract).toHaveBeenCalledTimes(3);
    expect(summary.hosts_processed).toBe(3);
    expect(summary.hosts_extracted).toBe(3);
  });

  test("per-host failure isolation: one host throws → others still processed; error captured; run completes", async () => {
    const supabase = makeSupabaseMock([
      { user_id: "host-1" },
      { user_id: "host-2" },
      { user_id: "host-3" },
    ]);
    mockExtract.mockImplementation(async (_supa, hostId: string) => {
      if (hostId === "host-2") throw new Error("simulated extractor failure");
      return { status: "extracted", sample_count: 50 };
    });

    const summary = await runExtractionForAllHosts(supabase);

    expect(mockExtract).toHaveBeenCalledTimes(3); // all 3 attempted
    expect(summary.hosts_processed).toBe(3);
    expect(summary.hosts_extracted).toBe(2);
    expect(summary.hosts_error).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toMatchObject({
      host_id: "host-2",
      message: "simulated extractor failure",
    });
  });

  test("result-variant aggregation: mixed extracted / no_change / insufficient_samples tally correctly", async () => {
    const supabase = makeSupabaseMock([
      { user_id: "host-1" },
      { user_id: "host-2" },
      { user_id: "host-3" },
      { user_id: "host-4" },
    ]);
    mockExtract
      .mockResolvedValueOnce({ status: "extracted", sample_count: 50, fact_id: "f1" })
      .mockResolvedValueOnce({ status: "no_change", sample_count: 50, prior_sample_count: 40 })
      .mockResolvedValueOnce({ status: "insufficient_samples", sample_count: 3 })
      .mockResolvedValueOnce({ status: "extracted", sample_count: 80, fact_id: "f2" });

    const summary = await runExtractionForAllHosts(supabase);

    expect(summary.hosts_processed).toBe(4);
    expect(summary.hosts_extracted).toBe(2);
    expect(summary.hosts_no_change).toBe(1);
    expect(summary.hosts_insufficient).toBe(1);
    expect(summary.hosts_error).toBe(0);
    expect(summary.errors).toEqual([]);
  });

  test("empty host set: summary all-zeros, no error, extractor not invoked", async () => {
    const supabase = makeSupabaseMock([]);

    const summary = await runExtractionForAllHosts(supabase);

    expect(mockExtract).not.toHaveBeenCalled();
    expect(summary).toEqual({
      hosts_processed: 0,
      hosts_extracted: 0,
      hosts_no_change: 0,
      hosts_insufficient: 0,
      hosts_error: 0,
      errors: [],
    });
  });

  test("DISTINCT enumeration: duplicate user_id rows deduplicated to unique hosts", async () => {
    // properties table may have multiple rows per host (one per property);
    // host enumeration must Set-dedupe.
    const supabase = makeSupabaseMock([
      { user_id: "host-1" },
      { user_id: "host-1" },
      { user_id: "host-2" },
      { user_id: null }, // NULL user_id filtered out
      { user_id: "host-1" },
    ]);
    mockExtract.mockResolvedValue({ status: "extracted", sample_count: 50 });

    const summary = await runExtractionForAllHosts(supabase);

    // 2 unique non-null host_ids: host-1, host-2.
    expect(mockExtract).toHaveBeenCalledTimes(2);
    expect(summary.hosts_processed).toBe(2);
  });
});
