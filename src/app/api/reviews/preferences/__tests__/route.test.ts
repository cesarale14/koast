/**
 * Tests for /api/reviews/preferences — M9 Phase G E3 STEP 8.3 Q-G6 β path.
 *
 * Covers the new host-scoped CRUD route that replaces the dropped
 * /api/reviews/rules/[propertyId] surface. Tests:
 *
 *   GET unauthed → 401
 *   GET authed, no fact → { rule } with DEFAULT payload
 *   GET authed, fact exists → { rule } with parsed payload
 *   PUT unauthed → 401
 *   PUT valid full body → calls writeReviewPreferences with parsed payload
 *   PUT valid partial body → merges with DEFAULT, calls writeReviewPreferences
 *   PUT invalid body → 400
 *
 * Strategy: mock auth + read/write helpers; verify route dispatches to
 * the helper layer with the expected shape.
 */

import { GET, PUT } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/supabase/service");
jest.mock("@/lib/memory/review-preferences");

import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  readReviewPreferences,
  writeReviewPreferences,
} from "@/lib/memory/review-preferences";
import {
  DEFAULT_REVIEW_PREFERENCES_PAYLOAD,
  type ReviewPreferencesPayload,
} from "@/lib/memory/review-preferences-fact-schema";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";

const HOST_TAUGHT_PAYLOAD: ReviewPreferencesPayload = {
  is_active: true,
  auto_publish: true,
  publish_delay_days: 5,
  tone: "professional",
  target_keywords: ["spotless", "quiet"],
  bad_review_delay: false,
};

function authedOk() {
  (getAuthenticatedUser as jest.Mock).mockResolvedValue({
    user: { id: HOST_ID },
  });
  (createServiceClient as jest.Mock).mockReturnValue({ /* stub */ });
}

function authedNo() {
  (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: null });
}

function buildPutRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/reviews/preferences", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/reviews/preferences", () => {
  test("401 when unauthenticated", async () => {
    authedNo();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  test("200 with DEFAULT payload when no fact exists", async () => {
    authedOk();
    (readReviewPreferences as jest.Mock).mockResolvedValue(
      DEFAULT_REVIEW_PREFERENCES_PAYLOAD,
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rule).toEqual(DEFAULT_REVIEW_PREFERENCES_PAYLOAD);
    expect(readReviewPreferences).toHaveBeenCalledWith(
      expect.anything(),
      HOST_ID,
    );
  });

  test("200 with parsed payload when fact exists", async () => {
    authedOk();
    (readReviewPreferences as jest.Mock).mockResolvedValue(HOST_TAUGHT_PAYLOAD);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rule).toEqual(HOST_TAUGHT_PAYLOAD);
  });
});

describe("PUT /api/reviews/preferences", () => {
  test("401 when unauthenticated", async () => {
    authedNo();
    const req = buildPutRequest(HOST_TAUGHT_PAYLOAD);
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  test("200 with full valid body; writeReviewPreferences called with parsed payload", async () => {
    authedOk();
    (writeReviewPreferences as jest.Mock).mockResolvedValue("new-fact-id");
    const req = buildPutRequest(HOST_TAUGHT_PAYLOAD);
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rule).toEqual(HOST_TAUGHT_PAYLOAD);
    expect(writeReviewPreferences).toHaveBeenCalledWith(
      expect.anything(),
      HOST_ID,
      HOST_TAUGHT_PAYLOAD,
    );
  });

  test("200 with partial body; merges with DEFAULT and writes", async () => {
    authedOk();
    (writeReviewPreferences as jest.Mock).mockResolvedValue("new-fact-id");
    const partial = { tone: "enthusiastic" };
    const req = buildPutRequest(partial);
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rule.tone).toBe("enthusiastic");
    // Other fields should be DEFAULT values.
    expect(body.rule.publish_delay_days).toBe(
      DEFAULT_REVIEW_PREFERENCES_PAYLOAD.publish_delay_days,
    );
    expect(body.rule.target_keywords).toEqual(
      DEFAULT_REVIEW_PREFERENCES_PAYLOAD.target_keywords,
    );
    expect(writeReviewPreferences).toHaveBeenCalledTimes(1);
    const writeArg = (writeReviewPreferences as jest.Mock).mock.calls[0][2];
    expect(writeArg.tone).toBe("enthusiastic");
    expect(writeArg.is_active).toBe(true); // DEFAULT
  });

  test("400 on invalid body (type mismatch)", async () => {
    authedOk();
    const req = buildPutRequest({ publish_delay_days: -1 });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(writeReviewPreferences).not.toHaveBeenCalled();
  });

  test("400 on invalid body (non-integer publish_delay_days)", async () => {
    authedOk();
    const req = buildPutRequest({ publish_delay_days: 3.5 });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(writeReviewPreferences).not.toHaveBeenCalled();
  });
});
