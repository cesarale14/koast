/**
 * Tests for voice extraction worker — M9 Phase E STEP 2.
 *
 * Focus: computeFeatures unit (no DB), selectSeedSamples unit,
 * extraction-worker integration paths (insufficient/no_change/extracted)
 * via inline supabase mock.
 */

import {
  computeFeatures,
  selectSeedSamples,
  extractVoiceForHost,
} from "../extraction-worker";

describe("computeFeatures — statistical extraction", () => {
  test("computes cadence (avg + stdev) from host messages", () => {
    const messages = [
      "Short one. Two sentences here.",
      "A bit longer sentence in this message.",
      "Even longer message with multiple sentences. Like this one. And another.",
    ];
    const features = computeFeatures(messages);
    expect(features.sentence_length_avg).toBeGreaterThan(0);
    expect(features.sentence_length_stdev).toBeGreaterThan(0);
    expect(features.sample_count).toBe(3);
  });

  test("handles single-sentence messages without terminator", () => {
    const features = computeFeatures(["Hi there"]);
    expect(features.sentence_length_avg).toBe(8);
    expect(features.sentence_length_stdev).toBe(0);
  });

  test("extracts greeting + closing patterns by frequency", () => {
    const messages = [
      "Hi Sarah! The wifi is in the drawer. Thanks!",
      "Hi Marcus, welcome. Door code is 1234. Thanks!",
      "Hey John, glad you arrived. Wifi pwd attached. Cheers!",
    ];
    const features = computeFeatures(messages);
    expect(features.greeting_patterns.length).toBeGreaterThan(0);
    expect(features.closing_patterns.length).toBeGreaterThan(0);
    // "thanks!" appears twice; should be in top closing patterns
    expect(features.closing_patterns.some((p) => p.includes("thanks"))).toBe(true);
  });

  test("vocabulary_signature filters stop words and ranks by frequency", () => {
    const messages = [
      "The wifi password is on the fridge.",
      "Wifi works fine in every room.",
      "Door code wifi same as before.",
    ];
    const features = computeFeatures(messages);
    // "wifi" should appear (frequency 3); "the" / "is" filtered as stop words
    expect(features.vocabulary_signature).toContain("wifi");
    expect(features.vocabulary_signature).not.toContain("the");
  });
});

describe("selectSeedSamples", () => {
  test("returns all messages when count ≤ SEED_SAMPLES_COUNT", () => {
    const messages = ["a", "b", "c"];
    expect(selectSeedSamples(messages)).toEqual(messages);
  });

  test("picks median-cadence messages when count > 5", () => {
    const messages = [
      "x",                     // 1 char (outlier short)
      "two",                   // 3 chars
      "five!",                 // 5 chars
      "seven ch",              // 8 chars (median range)
      "ten char",              // 8 chars
      "eleven char",           // 11 chars
      "twelve chars",          // 12 chars
      "thirteen chrs",         // 13 chars
      "long outlier message",  // long
    ];
    const samples = selectSeedSamples(messages);
    expect(samples.length).toBeLessThanOrEqual(5);
    // Outliers (shortest "x" and longest message) should not dominate
    expect(samples).not.toContain("x");
  });

  test("returns empty for empty input", () => {
    expect(selectSeedSamples([])).toEqual([]);
  });
});

// Inline supabase mock for extraction worker integration tests.
// The worker reads messages, then calls readVoiceMode + writeVoiceMode
// (which themselves chain on memory_facts). Mock messages + memory_facts
// distinctly via the `from(table)` discriminator.
function mockSupabaseForExtraction(opts: {
  hostMessages: Array<{ id: string; content: string; direction: string; created_at: string }>;
  priorVoiceFact?: { value: unknown } | null;
}) {
  // messages-table chain: .select().eq().order().limit().returns() →
  // returns the array via the .returns<HostMessageRow[]>() boundary that
  // the real call site reaches. Mock chain reproduces that shape.
  const messagesLimitReturns = jest.fn(() => Promise.resolve({ data: opts.hostMessages, error: null }));
  const messagesLimitWithReturns = jest.fn(() => ({ returns: messagesLimitReturns }));
  const messagesOrderWithLimit = jest.fn(() => ({ limit: messagesLimitWithReturns }));
  const messagesEq = jest.fn(() => ({ order: messagesOrderWithLimit }));
  const messagesSelect = jest.fn(() => ({ eq: messagesEq }));

  // memory_facts-table chain — for readVoiceMode + writeVoiceMode operations.
  // readVoiceMode: .select().eq().eq().eq().eq().eq().order().limit().maybeSingle()
  const factMaybeSingle = jest.fn(async () => ({
    data: opts.priorVoiceFact
      ? {
          id: "prior-fact",
          value: opts.priorVoiceFact.value,
          source: "inferred",
          confidence: 0.8,
          learned_at: new Date().toISOString(),
          status: "active",
        }
      : null,
    error: null,
  }));
  const factLimit = jest.fn(() => ({ maybeSingle: factMaybeSingle }));
  const factOrder = jest.fn(() => ({ limit: factLimit }));
  const factEq: { eq: jest.Mock } = { eq: jest.fn() };
  factEq.eq.mockReturnValue({ eq: factEq.eq, order: factOrder, limit: factLimit });
  const factSelect = jest.fn(() => ({ eq: factEq.eq, order: factOrder, limit: factLimit }));

  // writeVoiceMode insert: .insert().select().single()
  const factInsertSingle = jest.fn(async () => ({ data: { id: "new-fact-id" }, error: null }));
  const factInsertSelect = jest.fn(() => ({ single: factInsertSingle }));
  const factInsert = jest.fn(() => ({ select: factInsertSelect }));

  // writeVoiceMode update: .update().eq()
  const factUpdateEq = jest.fn(async () => ({ error: null }));
  const factUpdate = jest.fn(() => ({ eq: factUpdateEq }));

  const from = jest.fn((table: string) => {
    if (table === "messages") {
      return { select: messagesSelect };
    }
    if (table === "memory_facts") {
      return {
        select: factSelect,
        insert: factInsert,
        update: factUpdate,
      };
    }
    throw new Error(`Unexpected from(${table})`);
  });

  return { from } as unknown as Parameters<typeof extractVoiceForHost>[0];
}

describe("extractVoiceForHost — integration paths", () => {
  test("returns insufficient_samples when host has <10 messages", async () => {
    const supabase = mockSupabaseForExtraction({
      hostMessages: [
        { id: "m1", content: "Hi", direction: "outbound", created_at: "2026-05-01" },
      ],
    });
    const result = await extractVoiceForHost(supabase, "host-1");
    expect(result.status).toBe("insufficient_samples");
    expect(result.sample_count).toBe(1);
  });

  test("returns extracted when no prior fact and threshold met", async () => {
    const hostMessages = Array.from({ length: 15 }, (_, i) => ({
      id: `m${i}`,
      content: `Hi Sarah! Message body number ${i}. Thanks!`,
      direction: "outbound",
      created_at: "2026-05-01",
    }));
    const supabase = mockSupabaseForExtraction({
      hostMessages,
      priorVoiceFact: null,
    });
    const result = await extractVoiceForHost(supabase, "host-1");
    expect(result.status).toBe("extracted");
    expect(result.fact_id).toBe("new-fact-id");
    expect(result.sample_count).toBe(15);
  });
});
