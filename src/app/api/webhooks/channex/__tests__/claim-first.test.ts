/**
 * H6.1 — the Channex-webhook claim-first lock (TOCTOU fix). Proves a concurrent
 * re-delivery of the SAME revision is refused at the advisory-lock claim BEFORE
 * any processing, so the read-then-process dedup window can't double-fire the
 * booking bell / availability push. acquireLock is mocked to model "already held".
 */

jest.mock("@/lib/supabase/service");
jest.mock("@/lib/channex/client");
jest.mock("@/lib/concurrency/locks");

import { POST } from "../route";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import { acquireLock } from "@/lib/concurrency/locks";

const mockAcquire = acquireLock as jest.MockedFunction<typeof acquireLock>;

function bookingWebhook(revisionId: string): import("next/server").NextRequest {
  return {
    headers: { get: () => "test-ip" },
    json: async () => ({
      event: "booking_new",
      property_id: "cpx-1",
      payload: { booking_id: "bk-1", revision_id: revisionId, property_id: "cpx-1" },
    }),
  } as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Minimal svc — the claim-refused path returns before any DB use.
  const chain = { insert: async () => ({ error: null }), select: () => chain, eq: () => chain, in: () => chain, limit: async () => ({ data: [] }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (createServiceClient as jest.Mock).mockReturnValue({ from: () => chain } as any);
});

test("revision already in-flight (claim refused) → skipped_in_flight, NO processing", async () => {
  mockAcquire.mockResolvedValue(false); // another delivery holds the revision lock
  const getBooking = jest.fn();
  (createChannexClient as jest.Mock).mockReturnValue({ getBooking });

  const res = await POST(bookingWebhook("rev-123"));
  const body = await res.json();

  expect(mockAcquire).toHaveBeenCalledWith(expect.anything(), "channex_revision:rev-123", 120);
  expect(body.action).toBe("skipped_in_flight");
  expect(body.revision_id).toBe("rev-123");
  // The processing path (booking fetch) is never reached.
  expect(getBooking).not.toHaveBeenCalled();
});

test("claim acquired → proceeds past the lock (into normal processing)", async () => {
  mockAcquire.mockResolvedValue(true);
  // getBooking present but we only assert we got PAST the claim (no skipped_in_flight).
  (createChannexClient as jest.Mock).mockReturnValue({ getBooking: jest.fn(async () => ({ data: null })) });

  const res = await POST(bookingWebhook("rev-456"));
  const body = await res.json();

  expect(mockAcquire).toHaveBeenCalledWith(expect.anything(), "channex_revision:rev-456", 120);
  expect(body.action).not.toBe("skipped_in_flight");
});
