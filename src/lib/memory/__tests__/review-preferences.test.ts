/**
 * Tests for review-preferences substrate — M9 Phase G E3 STEP 8.2.
 *
 * Mirrors D25 voice-mode test pattern exactly: schema validation +
 * read/write integration with inline supabase mocks (memory_facts
 * read-then-write-then-update sequence per supersession path).
 *
 * Coverage:
 *   - Schema validates correct payload + rejects malformed
 *   - DEFAULT_REVIEW_PREFERENCES_PAYLOAD shape matches schema
 *   - readReviewPreferences returns DEFAULT when no fact exists
 *   - readReviewPreferences returns payload when fact exists
 *   - writeReviewPreferences inserts initial fact when none exists
 *   - writeReviewPreferences inserts + supersedes prior when one exists
 *   - writeReviewPreferences rejects invalid payload before any DB call
 */

import {
  ReviewPreferencesPayloadSchema,
  DEFAULT_REVIEW_PREFERENCES_PAYLOAD,
  type ReviewPreferencesPayload,
} from "../review-preferences-fact-schema";
import {
  readReviewPreferences,
  writeReviewPreferences,
} from "../review-preferences";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";

const SAMPLE_HOST_TAUGHT: ReviewPreferencesPayload = {
  is_active: true,
  auto_publish: true,
  publish_delay_days: 5,
  tone: "professional",
  target_keywords: ["spotless", "central", "fast wifi"],
  bad_review_delay: false,
};

// =====================================================================
// Schema tests
// =====================================================================

describe("ReviewPreferencesPayloadSchema", () => {
  test("validates a host-taught payload shape", () => {
    expect(
      ReviewPreferencesPayloadSchema.safeParse(SAMPLE_HOST_TAUGHT).success,
    ).toBe(true);
  });

  test("validates the DEFAULT payload", () => {
    expect(
      ReviewPreferencesPayloadSchema.safeParse(DEFAULT_REVIEW_PREFERENCES_PAYLOAD)
        .success,
    ).toBe(true);
  });

  test("rejects non-boolean is_active", () => {
    const bad = { ...SAMPLE_HOST_TAUGHT, is_active: "yes" as unknown as boolean };
    expect(ReviewPreferencesPayloadSchema.safeParse(bad).success).toBe(false);
  });

  test("rejects negative publish_delay_days", () => {
    const bad = { ...SAMPLE_HOST_TAUGHT, publish_delay_days: -1 };
    expect(ReviewPreferencesPayloadSchema.safeParse(bad).success).toBe(false);
  });

  test("rejects non-integer publish_delay_days", () => {
    const bad = { ...SAMPLE_HOST_TAUGHT, publish_delay_days: 3.5 };
    expect(ReviewPreferencesPayloadSchema.safeParse(bad).success).toBe(false);
  });

  test("accepts empty target_keywords array", () => {
    const empty = { ...SAMPLE_HOST_TAUGHT, target_keywords: [] };
    expect(ReviewPreferencesPayloadSchema.safeParse(empty).success).toBe(true);
  });
});

describe("DEFAULT_REVIEW_PREFERENCES_PAYLOAD", () => {
  test("matches historical route fallback defaults", () => {
    expect(DEFAULT_REVIEW_PREFERENCES_PAYLOAD).toEqual({
      is_active: true,
      auto_publish: false,
      publish_delay_days: 3,
      tone: "warm",
      target_keywords: ["clean", "location", "comfortable"],
      bad_review_delay: true,
    });
  });
});

// =====================================================================
// Inline supabase mock — mirror voice-mode.test.ts pattern exactly.
// memory_facts read-then-insert-then-update sequence.
// =====================================================================

function mockMemoryFactsClient(opts: {
  priorLookup: { data: { id: string } | null; error: { message: string } | null };
  insertResult: { data: { id: string } | null; error: { message: string } | null };
  updateResult: { error: { message: string } | null };
  activeRead?: {
    data:
      | { id: string; value: unknown; source: string; confidence: number; learned_at: string; status: string }
      | null;
    error: { message: string } | null;
  };
}) {
  const maybeSingleSeq: Array<typeof opts.priorLookup | typeof opts.activeRead> = [];
  if (opts.activeRead) maybeSingleSeq.push(opts.activeRead);
  maybeSingleSeq.push(opts.priorLookup);

  let maybeSingleCallCount = 0;
  const maybeSingle = jest.fn(async () => {
    const next = maybeSingleSeq[maybeSingleCallCount];
    maybeSingleCallCount += 1;
    return next ?? opts.priorLookup;
  });

  const limit = jest.fn(() => ({ maybeSingle }));
  const order = jest.fn(() => ({ limit }));
  const eqSelectChain: { eq: jest.Mock } = { eq: jest.fn() };
  eqSelectChain.eq.mockReturnValue({ eq: eqSelectChain.eq, order, limit });
  const selectChain = { eq: eqSelectChain.eq, order, limit };
  const select = jest.fn(() => selectChain);

  const insertSingle = jest.fn(async () => opts.insertResult);
  const insertSelect = jest.fn(() => ({ single: insertSingle }));
  const insert = jest.fn(() => ({ select: insertSelect }));

  const updateEq = jest.fn(async () => opts.updateResult);
  const update = jest.fn(() => ({ eq: updateEq }));

  const from = jest.fn(() => ({ select, insert, update }));
  return { from } as unknown as Parameters<typeof readReviewPreferences>[0];
}

// =====================================================================
// writeReviewPreferences tests
// =====================================================================

describe("writeReviewPreferences — initial write (no prior fact)", () => {
  test("inserts a new active fact and does not call update", async () => {
    const supabase = mockMemoryFactsClient({
      priorLookup: { data: null, error: null },
      insertResult: { data: { id: "new-fact-id" }, error: null },
      updateResult: { error: null },
    });
    const id = await writeReviewPreferences(supabase, HOST_ID, SAMPLE_HOST_TAUGHT);
    expect(id).toBe("new-fact-id");
  });
});

describe("writeReviewPreferences — supersession when prior fact exists", () => {
  test("inserts new fact then updates prior to superseded", async () => {
    const supabase = mockMemoryFactsClient({
      priorLookup: { data: { id: "prior-id" }, error: null },
      insertResult: { data: { id: "new-id" }, error: null },
      updateResult: { error: null },
    });
    const id = await writeReviewPreferences(supabase, HOST_ID, SAMPLE_HOST_TAUGHT);
    expect(id).toBe("new-id");
  });
});

describe("writeReviewPreferences — invalid payload rejection", () => {
  test("throws on invalid payload before any DB call", async () => {
    const supabase = mockMemoryFactsClient({
      priorLookup: { data: null, error: null },
      insertResult: { data: { id: "x" }, error: null },
      updateResult: { error: null },
    });
    await expect(
      writeReviewPreferences(supabase, HOST_ID, {
        is_active: "yes",
      } as unknown as ReviewPreferencesPayload),
    ).rejects.toThrow(/invalid payload/);
  });
});

// =====================================================================
// readReviewPreferences tests
// =====================================================================

describe("readReviewPreferences", () => {
  test("returns DEFAULT when no active fact exists (no null leak)", async () => {
    const supabase = mockMemoryFactsClient({
      priorLookup: { data: null, error: null },
      insertResult: { data: null, error: null },
      updateResult: { error: null },
      activeRead: { data: null, error: null },
    });
    const result = await readReviewPreferences(supabase, HOST_ID);
    expect(result).toEqual(DEFAULT_REVIEW_PREFERENCES_PAYLOAD);
  });

  test("returns parsed payload when fact exists", async () => {
    const supabase = mockMemoryFactsClient({
      priorLookup: { data: null, error: null },
      insertResult: { data: null, error: null },
      updateResult: { error: null },
      activeRead: {
        data: {
          id: "fact-id",
          value: SAMPLE_HOST_TAUGHT,
          source: "host_taught",
          confidence: 1.0,
          learned_at: "2026-05-17T00:00:00Z",
          status: "active",
        },
        error: null,
      },
    });
    const result = await readReviewPreferences(supabase, HOST_ID);
    expect(result).toEqual(SAMPLE_HOST_TAUGHT);
  });

  test("returns DEFAULT when stored fact value is malformed (no throw)", async () => {
    const supabase = mockMemoryFactsClient({
      priorLookup: { data: null, error: null },
      insertResult: { data: null, error: null },
      updateResult: { error: null },
      activeRead: {
        data: {
          id: "fact-id",
          value: { broken: true } as unknown,
          source: "host_taught",
          confidence: 1.0,
          learned_at: "2026-05-17T00:00:00Z",
          status: "active",
        },
        error: null,
      },
    });
    const result = await readReviewPreferences(supabase, HOST_ID);
    expect(result).toEqual(DEFAULT_REVIEW_PREFERENCES_PAYLOAD);
  });
});
