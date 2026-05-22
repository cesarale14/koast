/**
 * /api/voice/extract auth tests. M10 Phase E STEP 6.
 *
 * Covers the service-key-only gate per ultraplan §13.1 (closes the
 * all-hosts-via-non-admin scope hole; manual route MUST NOT accept a plain
 * authenticated-user path).
 *
 *   - x-service-key missing  → 401
 *   - Wrong service-key      → 401
 *   - Correct service-key    → 200 + summary
 *
 * Handler mocked (STEP 5 covers its logic); these tests gate AUTH only.
 *
 * 3 tests; 733 → 736.
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/supabase/service");
jest.mock("@/lib/voice/extraction-scheduler");

import { POST } from "@/app/api/voice/extract/route";
import { createServiceClient } from "@/lib/supabase/service";
import { runExtractionForAllHosts } from "@/lib/voice/extraction-scheduler";

const SERVICE_KEY = "test-service-role-key-value-1234567890";
const EMPTY_SUMMARY = {
  hosts_processed: 0,
  hosts_extracted: 0,
  hosts_no_change: 0,
  hosts_insufficient: 0,
  hosts_error: 0,
  errors: [],
};

function makeRequest(serviceKey?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (serviceKey !== undefined) headers["x-service-key"] = serviceKey;
  return new NextRequest("https://test.koasthq.com/api/voice/extract", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (createServiceClient as jest.MockedFunction<typeof createServiceClient>).mockReturnValue({} as any);
  (
    runExtractionForAllHosts as jest.MockedFunction<typeof runExtractionForAllHosts>
  ).mockResolvedValue(EMPTY_SUMMARY);
});

describe("/api/voice/extract — service-key-only auth (per §13.1; no authenticated-user path)", () => {
  test("no x-service-key header → 401 (handler not invoked)", async () => {
    const res = await POST(makeRequest(undefined));
    expect(res.status).toBe(401);
    expect(runExtractionForAllHosts).not.toHaveBeenCalled();
  });

  test("wrong service-key → 401", async () => {
    const res = await POST(makeRequest("not-the-real-service-key"));
    expect(res.status).toBe(401);
    expect(runExtractionForAllHosts).not.toHaveBeenCalled();
  });

  test("correct service-key → 200 + summary; handler invoked once (D49 attestation vehicle)", async () => {
    const res = await POST(makeRequest(SERVICE_KEY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ summary: EMPTY_SUMMARY });
    expect(runExtractionForAllHosts).toHaveBeenCalledTimes(1);
  });
});
