/**
 * /api/cron/voice-extraction auth tests. M10 Phase E STEP 6.
 *
 * Covers the Authorization-Bearer-CRON_SECRET gate per ultraplan §13.2:
 *   - Header missing  → 401
 *   - Wrong secret    → 401
 *   - UNSET CRON_SECRET in env → 401 (null-safe; never pass-both-undefined)
 *   - Correct secret  → 200 + summary
 *
 * Handler is mocked (STEP 5 covers its logic); these tests gate AUTH only.
 *
 * 4 tests; 729 → 733.
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/supabase/service");
jest.mock("@/lib/voice/extraction-scheduler");

import { POST } from "@/app/api/cron/voice-extraction/route";
import { createServiceClient } from "@/lib/supabase/service";
import { runExtractionForAllHosts } from "@/lib/voice/extraction-scheduler";

const SECRET = "test-cron-secret-value-1234567890";
const EMPTY_SUMMARY = {
  hosts_processed: 0,
  hosts_extracted: 0,
  hosts_no_change: 0,
  hosts_insufficient: 0,
  hosts_error: 0,
  errors: [],
};

function makeRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers["authorization"] = authHeader;
  return new NextRequest("https://test.koasthq.com/api/cron/voice-extraction", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (createServiceClient as jest.MockedFunction<typeof createServiceClient>).mockReturnValue({} as any);
  (
    runExtractionForAllHosts as jest.MockedFunction<typeof runExtractionForAllHosts>
  ).mockResolvedValue(EMPTY_SUMMARY);
});

describe("/api/cron/voice-extraction — Authorization Bearer CRON_SECRET", () => {
  test("no Authorization header → 401 (handler not invoked)", async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await POST(makeRequest(undefined));
    expect(res.status).toBe(401);
    expect(runExtractionForAllHosts).not.toHaveBeenCalled();
  });

  test("wrong secret → 401", async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await POST(makeRequest("Bearer not-the-secret"));
    expect(res.status).toBe(401);
    expect(runExtractionForAllHosts).not.toHaveBeenCalled();
  });

  test("UNSET CRON_SECRET (env undefined) → 401 even if request supplies any value (null-safe per §13.2)", async () => {
    delete process.env.CRON_SECRET;
    // Operator forgot to set the secret; request happens to carry a Bearer
    // anyway. The check MUST reject (never pass-both-undefined).
    const res1 = await POST(makeRequest("Bearer anything"));
    expect(res1.status).toBe(401);
    // Empty Bearer (supplied="") also rejects.
    const res2 = await POST(makeRequest("Bearer "));
    expect(res2.status).toBe(401);
    expect(runExtractionForAllHosts).not.toHaveBeenCalled();
  });

  test("correct secret → 200 + summary; handler invoked once", async () => {
    process.env.CRON_SECRET = SECRET;
    const res = await POST(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ summary: EMPTY_SUMMARY });
    expect(runExtractionForAllHosts).toHaveBeenCalledTimes(1);
  });
});
