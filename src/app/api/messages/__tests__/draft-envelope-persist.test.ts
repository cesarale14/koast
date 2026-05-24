/**
 * /api/messages/draft persistence test.
 * M10 Phase D STEP 7 (S3) + Phase E STEP 8c (G8-E2 fix).
 *
 * Asserts the route's persistence contract:
 *
 *  - INSERTs a NEW outbound draft row (matching messaging_executor.py:319-332
 *    producer shape; not an UPDATE on the inbound message — that was G8-E2,
 *    fixed at STEP 8c).
 *  - Payload includes thread_id + property_id + booking_id from the inbound
 *    message; direction='outbound'; sender='property'; sender_name='Host';
 *    content+ai_draft=filteredDraft; draft_status='draft_pending_approval'
 *    (G8-E1 unified producer-value); envelope=filteredEnvelope (Phase D S7
 *    D22 envelope). STEP 8d dropped original_draft_text — phantom column not
 *    in production (schema.ts ↔ prod drift, migration 20260515220000 unapplied;
 *    zero readers across the codebase).
 *  - .select().single() error/empty surfaces as 500 (G8-E2 surface-failure
 *    guard — never ship another silent-200 write).
 *
 * Heavy-mock approach: all route deps stubbed (auth, generator, applyOutputJudges,
 * voice helpers, supabase chain).
 *
 * 3 tests (was 2 pre-8c).
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/supabase/service");
jest.mock("@/lib/claude/messaging");
jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/memory/voice-mode");
jest.mock("@/lib/voice/build-voice-prompt");
jest.mock("@/lib/agent/judge/apply-output-judges");

import { POST } from "@/app/api/messages/draft/route";
import { createServiceClient } from "@/lib/supabase/service";
import { generateDraft } from "@/lib/claude/messaging";
import {
  getAuthenticatedUser,
  verifyPropertyOwnership,
} from "@/lib/auth/api-auth";
import { readVoiceMode } from "@/lib/memory/voice-mode";
import { buildVoicePrompt } from "@/lib/voice/build-voice-prompt";
import { applyOutputJudges } from "@/lib/agent/judge/apply-output-judges";

type MockedFn<T extends (...args: never[]) => unknown> = jest.MockedFunction<T>;

// Shared inbound row stub. STEP 8c adds thread_id to the SELECT — INSERT
// payload must echo it (alongside property_id + booking_id) so the new
// outbound row lands in the same conversation.
const inboundRow = {
  id: "inbound-msg-uuid",
  thread_id: "thread-uuid",
  property_id: "prop-uuid",
  booking_id: "booking-uuid",
  content: "Hi when is check-in?",
  platform: "airbnb",
  sender_name: "Guest",
};
const propertyRow = {
  name: "Villa Jamaica",
  city: "Tampa",
  bedrooms: 3,
  bathrooms: 2,
  max_guests: 6,
};
const generatedEnvelope = {
  content: "Check-in is at 4pm. Door code in chat.",
  confidence: "high_inference" as const,
  source_attribution: [],
};
const filteredEnvelope = {
  ...generatedEnvelope,
  judge_results: [
    {
      judge_id: "emoji_policy" as const,
      verdict: "pass" as const,
      reason: "no_emoji_found",
      confidence: 1.0,
    },
  ],
};

function setupCommonMocks(
  insertChain: ReturnType<typeof jest.fn>,
): void {
  (getAuthenticatedUser as MockedFn<typeof getAuthenticatedUser>).mockResolvedValue({
    user: { id: "host-uuid" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  (
    verifyPropertyOwnership as MockedFn<typeof verifyPropertyOwnership>
  ).mockResolvedValue(true);

  const fromMock = jest.fn((table: string) => {
    if (table === "messages") {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
            limit: jest.fn().mockResolvedValue({ data: [inboundRow], error: null }),
          }),
        }),
        insert: insertChain,
      };
    }
    if (table === "properties") {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({ data: [propertyRow], error: null }),
          }),
        }),
      };
    }
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
          limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    };
  });
  (createServiceClient as MockedFn<typeof createServiceClient>).mockReturnValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: fromMock as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  (readVoiceMode as MockedFn<typeof readVoiceMode>).mockResolvedValue(null);
  (buildVoicePrompt as MockedFn<typeof buildVoicePrompt>).mockReturnValue("");

  (generateDraft as MockedFn<typeof generateDraft>).mockResolvedValue({
    content: generatedEnvelope.content,
    envelope: generatedEnvelope,
  });
  (applyOutputJudges as MockedFn<typeof applyOutputJudges>).mockResolvedValue({
    finalText: generatedEnvelope.content,
    envelope: filteredEnvelope,
  });
}

function makeRequest(): NextRequest {
  return new NextRequest("https://test.koasthq.com/api/messages/draft", {
    method: "POST",
    body: JSON.stringify({ messageId: "inbound-msg-uuid" }),
  });
}

describe("/api/messages/draft — INSERT-outbound persistence (M10 Phase E STEP 8c, G8-E2 fix)", () => {
  test("INSERTs a NEW outbound draft row with the full payload (thread_id + envelope + draft_status)", async () => {
    const insertedRow = { id: "new-draft-row-uuid" };
    const insertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: insertedRow, error: null }),
      }),
    });
    setupCommonMocks(insertMock);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0];
    // G8-E2 fix: INSERT-outbound shape matching messaging_executor.py.
    expect(payload).toMatchObject({
      thread_id: inboundRow.thread_id,
      property_id: inboundRow.property_id,
      booking_id: inboundRow.booking_id,
      direction: "outbound",
      sender: "property",
      sender_name: "Host",
      content: generatedEnvelope.content,
      ai_draft: generatedEnvelope.content,
      // G8-E1 unified producer-value (UnifiedInbox.tsx:831 render gate +
      // discard route + approveDraft all gate on this value).
      draft_status: "draft_pending_approval",
      // Phase D S7 D22 envelope (post-J1+J2 augmented; not raw generator).
      envelope: filteredEnvelope,
    });
    expect(payload.envelope).toBe(filteredEnvelope);
    expect(payload.envelope.judge_results).toHaveLength(1);
    // STEP 8d (G8-E2 root cause) regression guard: original_draft_text MUST
    // NOT be in the payload (phantom column; not in production messages
    // schema; would re-introduce the silent-fail-pre-8c bug under any future
    // surface-failure-guard removal).
    expect(payload).not.toHaveProperty("original_draft_text");

    // Response surfaces the new row's id (handler re-fetches the thread; the
    // new row appears alongside the inbound via the thread fetch).
    const body = await res.json();
    expect(body.messageId).toBe(insertedRow.id);
    // Response is JSON-serialized so reference equality won't hold; deep
    // equality is what matters for the wire contract.
    expect(body.envelope).toEqual(filteredEnvelope);
  });

  test("G8-E1 regression guard: draft_status MUST be 'draft_pending_approval' (the value all UI consumers gate on; not 'generated')", async () => {
    const insertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: "x" }, error: null }),
      }),
    });
    setupCommonMocks(insertMock);

    await POST(makeRequest());

    const payload = insertMock.mock.calls[0][0];
    expect(payload.draft_status).toBe("draft_pending_approval");
    expect(payload.draft_status).not.toBe("generated");
  });

  test("G8-E2 surface-failure guard: INSERT error → 500 (never silent-200)", async () => {
    // Simulates the production no-op pattern: SELECT works (200) but write
    // returns an error. Before STEP 8c the route discarded the result and
    // returned 200 anyway. The .select().single() + error check must surface
    // as a 500. Repeat for the "no row returned" path below.
    const insertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: "new row violates row-level security policy" },
        }),
      }),
    });
    setupCommonMocks(insertMock);

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/draft persist failed/);
    expect(body.error).toMatch(/row-level security/);
  });

  test("G8-E2 surface-failure guard: INSERT returns no row → 500", async () => {
    const insertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });
    setupCommonMocks(insertMock);

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/no row returned/);
  });
});
