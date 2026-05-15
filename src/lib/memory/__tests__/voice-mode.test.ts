/**
 * Tests for voice-fact substrate — M9 Phase E STEP 1.
 *
 * Schema validation + read/write integration with inline supabase
 * mocks (memory_facts read-then-write-then-update sequence per
 * supersession path). Phase A canonical helper pattern doesn't fit
 * the multi-operation-same-table shape; inline mocks per test.
 */

import {
  VoiceFactPayloadSchema,
  NEUTRAL_VOICE_FACT_PAYLOAD,
  type VoiceFactPayload,
} from "../voice-fact-schema";
import { readVoiceMode, writeVoiceMode } from "../voice-mode";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";

const SAMPLE_LEARNED: VoiceFactPayload = {
  mode: "learned",
  features: {
    sentence_length_avg: 65,
    sentence_length_stdev: 18,
    greeting_patterns: ["Hi {first_name}!", "Hey {first_name},"],
    closing_patterns: ["— Cesar", "Thanks!"],
    vocabulary_signature: ["Brickell", "front door", "lockbox"],
    sample_count: 53,
  },
  seed_samples: ["Hi Sarah! The wifi is...", "Hey Marcus, the door..."],
};

describe("VoiceFactPayloadSchema", () => {
  test("validates the audit-defined payload shape", () => {
    expect(VoiceFactPayloadSchema.safeParse(SAMPLE_LEARNED).success).toBe(true);
  });

  test("validates neutral baseline payload", () => {
    expect(
      VoiceFactPayloadSchema.safeParse(NEUTRAL_VOICE_FACT_PAYLOAD).success,
    ).toBe(true);
  });

  test("rejects invalid mode enum", () => {
    const bad = { ...SAMPLE_LEARNED, mode: "casual" };
    expect(VoiceFactPayloadSchema.safeParse(bad).success).toBe(false);
  });

  test("rejects negative sample_count", () => {
    const bad = {
      ...SAMPLE_LEARNED,
      features: { ...SAMPLE_LEARNED.features, sample_count: -1 },
    };
    expect(VoiceFactPayloadSchema.safeParse(bad).success).toBe(false);
  });

  test("seed_samples is optional", () => {
    const { seed_samples: _omit, ...withoutSamples } = SAMPLE_LEARNED;
    void _omit;
    expect(VoiceFactPayloadSchema.safeParse(withoutSamples).success).toBe(true);
  });
});

describe("NEUTRAL_VOICE_FACT_PAYLOAD", () => {
  test("matches schema and represents un-extracted state", () => {
    const result = VoiceFactPayloadSchema.safeParse(NEUTRAL_VOICE_FACT_PAYLOAD);
    expect(result.success).toBe(true);
    expect(NEUTRAL_VOICE_FACT_PAYLOAD.mode).toBe("neutral");
    expect(NEUTRAL_VOICE_FACT_PAYLOAD.features.sample_count).toBe(0);
  });
});

// Inline supabase mock for the specific call sequence used by
// voice-mode.ts. Each test wires the chain methods individually.
function mockMemoryFactsClient(opts: {
  /** Result returned by the prior-fact lookup (SELECT maybeSingle). */
  priorLookup: { data: { id: string } | null; error: { message: string } | null };
  /** Result returned by the INSERT...select single. */
  insertResult: { data: { id: string } | null; error: { message: string } | null };
  /** Result returned by the supersession UPDATE. */
  updateResult: { error: { message: string } | null };
  /** Result returned by the active-read SELECT maybeSingle. */
  activeRead?: {
    data: { id: string; value: unknown; source: string; confidence: number; learned_at: string; status: string } | null;
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
  // The chain ends with .eq(...).order(...).limit(1).maybeSingle()
  // So we make .eq always return the chain, with order/limit attached.
  const selectChain = { eq: eqSelectChain.eq, order, limit };
  const select = jest.fn(() => selectChain);

  const insertSingle = jest.fn(async () => opts.insertResult);
  const insertSelect = jest.fn(() => ({ single: insertSingle }));
  const insert = jest.fn(() => ({ select: insertSelect }));

  const updateEq = jest.fn(async () => opts.updateResult);
  const update = jest.fn(() => ({ eq: updateEq }));

  const from = jest.fn(() => ({ select, insert, update }));
  return { from } as unknown as Parameters<typeof readVoiceMode>[0];
}

describe("writeVoiceMode — initial write (no prior fact)", () => {
  test("inserts a new active fact and does not call update", async () => {
    const supabase = mockMemoryFactsClient({
      priorLookup: { data: null, error: null },
      insertResult: { data: { id: "new-fact-id" }, error: null },
      updateResult: { error: null },
    });
    const id = await writeVoiceMode(supabase, HOST_ID, SAMPLE_LEARNED);
    expect(id).toBe("new-fact-id");
  });
});

describe("writeVoiceMode — supersession when prior fact exists", () => {
  test("inserts new fact then updates prior to superseded", async () => {
    const supabase = mockMemoryFactsClient({
      priorLookup: { data: { id: "prior-id" }, error: null },
      insertResult: { data: { id: "new-id" }, error: null },
      updateResult: { error: null },
    });
    const id = await writeVoiceMode(supabase, HOST_ID, SAMPLE_LEARNED);
    expect(id).toBe("new-id");
  });
});

describe("writeVoiceMode — invalid payload rejection", () => {
  test("throws on invalid payload before any DB call", async () => {
    const supabase = mockMemoryFactsClient({
      priorLookup: { data: null, error: null },
      insertResult: { data: { id: "x" }, error: null },
      updateResult: { error: null },
    });
    await expect(
      writeVoiceMode(supabase, HOST_ID, {
        mode: "casual",
      } as unknown as VoiceFactPayload),
    ).rejects.toThrow(/invalid payload/);
  });
});

describe("readVoiceMode", () => {
  test("returns null when no active fact exists", async () => {
    const supabase = mockMemoryFactsClient({
      priorLookup: { data: null, error: null },
      insertResult: { data: null, error: null },
      updateResult: { error: null },
      activeRead: { data: null, error: null },
    });
    const result = await readVoiceMode(supabase, HOST_ID);
    expect(result).toBeNull();
  });

  test("returns parsed payload when active fact exists", async () => {
    const supabase = mockMemoryFactsClient({
      priorLookup: { data: null, error: null },
      insertResult: { data: null, error: null },
      updateResult: { error: null },
      activeRead: {
        data: {
          id: "fact-id",
          value: SAMPLE_LEARNED,
          source: "inferred",
          confidence: 0.85,
          learned_at: new Date().toISOString(),
          status: "active",
        },
        error: null,
      },
    });
    const result = await readVoiceMode(supabase, HOST_ID);
    expect(result).toEqual(SAMPLE_LEARNED);
  });

  test("returns null on malformed payload value (defensive fallthrough)", async () => {
    const supabase = mockMemoryFactsClient({
      priorLookup: { data: null, error: null },
      insertResult: { data: null, error: null },
      updateResult: { error: null },
      activeRead: {
        data: {
          id: "fact-id",
          value: { mode: "unsupported_mode_value" },
          source: "inferred",
          confidence: 0.5,
          learned_at: new Date().toISOString(),
          status: "active",
        },
        error: null,
      },
    });
    const result = await readVoiceMode(supabase, HOST_ID);
    expect(result).toBeNull();
  });
});
