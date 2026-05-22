/**
 * /api/messages/draft envelope persistence test.
 * M10 Phase D STEP 7 (S3).
 *
 * Verifies the route's messages UPDATE includes the post-J1+J2 filteredEnvelope
 * alongside ai_draft + original_draft_text. Activates the M3-outcome-3-family
 * 2nd-instance app-level enforcement on new drafts (historical NULL per STEP 6).
 *
 * Heavy-mock approach: all route deps stubbed (auth, generator, applyOutputJudges,
 * voice helpers, supabase chain). Test isolates the persist payload shape — the
 * one-line code path STEP 7 introduces.
 *
 * 1 test; 721 → 722.
 */

import { NextRequest } from "next/server";

// Mock all route deps BEFORE importing the route handler.
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

describe("/api/messages/draft — envelope persistence (M10 Phase D STEP 7)", () => {
  test("UPDATE on messages includes envelope alongside ai_draft + original_draft_text", async () => {
    // Auth + ownership pass.
    (getAuthenticatedUser as MockedFn<typeof getAuthenticatedUser>).mockResolvedValue({
      user: { id: "host-uuid" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    (
      verifyPropertyOwnership as MockedFn<typeof verifyPropertyOwnership>
    ).mockResolvedValue(true);

    // Capture the messages UPDATE payload via a chained supabase mock.
    const updateMock = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    const messageRow = {
      id: "msg-uuid",
      property_id: "prop-uuid",
      booking_id: null,
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
    const fromMock = jest.fn((table: string) => {
      if (table === "messages") {
        // First call: SELECT messages by id (route line ~21).
        // Subsequent calls might re-enter "messages" for the UPDATE; route the
        // mock by inspecting the chain — for this test, prioritize update path.
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
              limit: jest.fn().mockResolvedValue({ data: [messageRow], error: null }),
            }),
          }),
          update: updateMock,
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
      // Default: empty result chain.
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

    // Voice helpers return null/empty.
    (readVoiceMode as MockedFn<typeof readVoiceMode>).mockResolvedValue(null);
    (buildVoicePrompt as MockedFn<typeof buildVoicePrompt>).mockReturnValue("");

    // generateDraft returns content + envelope.
    const generatedEnvelope = {
      content: "Check-in is at 4pm. Door code in chat.",
      confidence: "high_inference" as const,
      source_attribution: [],
    };
    (generateDraft as MockedFn<typeof generateDraft>).mockResolvedValue({
      content: generatedEnvelope.content,
      envelope: generatedEnvelope,
    });

    // applyOutputJudges returns post-J1+J2 envelope (the filteredEnvelope that
    // STEP 7 persists).
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
    (applyOutputJudges as MockedFn<typeof applyOutputJudges>).mockResolvedValue({
      finalText: generatedEnvelope.content,
      envelope: filteredEnvelope,
    });

    // Invoke the route.
    const req = new NextRequest("https://test.koasthq.com/api/messages/draft", {
      method: "POST",
      body: JSON.stringify({ messageId: "msg-uuid" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify the UPDATE call included envelope alongside ai_draft + original.
    expect(updateMock).toHaveBeenCalledTimes(1);
    const updatePayload = updateMock.mock.calls[0][0];
    expect(updatePayload).toMatchObject({
      ai_draft: generatedEnvelope.content,
      draft_status: "generated",
      original_draft_text: generatedEnvelope.content,
      envelope: filteredEnvelope,
    });
    // Defense-in-depth: envelope value is the post-J1+J2 augmented object, not
    // the raw generator envelope.
    expect(updatePayload.envelope).toBe(filteredEnvelope);
    expect(updatePayload.envelope.judge_results).toHaveLength(1);
  });
});
