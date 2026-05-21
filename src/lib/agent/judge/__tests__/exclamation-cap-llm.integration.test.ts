/**
 * J2 Haiku semantic judge — real-LLM integration smoke. M10 Phase B STEP 9.
 *
 * Validates the assumption that mocked unit tests structurally cannot
 * cover: does EXCLAMATION_JUDGE_SYSTEM_PROMPT elicit parseable JSON from
 * real claude-haiku-4-5-20251001, and does it discriminate theatrical
 * cases that are unambiguous-by-design?
 *
 * Env-gated: requires INTEGRATION=1 to run. Excluded from default CI per
 * ultraplan S-b (J2 integration smoke separate from CI). Establishes the
 * Koast INTEGRATION-gate convention (first integration test in this repo).
 *
 * Cost: 3 real Haiku calls per run (~$0.001 each at observed input/output
 * sizes). Run sparingly; not on every commit.
 *
 * Requires: ANTHROPIC_API_KEY in env (source ~/koast/.env.local before
 * running, or set in Vercel preview env if running there).
 */

import { invokeHaikuJudge } from "@/lib/agent/judge/exclamation-cap-llm";

const RUN_INTEGRATION = process.env.INTEGRATION === "1";

(RUN_INTEGRATION ? describe : describe.skip)(
  "invokeHaikuJudge — real Haiku integration smoke",
  () => {
    jest.setTimeout(30_000);

    test("schema validity — real Haiku response parses to valid JudgeResult", async () => {
      const text =
        "Welcome! Coffee in kitchen! Door code 1234! Have a great stay!";
      const result = await invokeHaikuJudge(text, "host-to-guest", 4, 3);

      expect(result.judge_id).toBe("exclamation_cap");
      expect(["pass", "fail"]).toContain(result.verdict);
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
      expect(typeof result.confidence).toBe("number");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);

      // If parse failed, confidence is 0.5 + reason is judge_parse_error;
      // surface this so the operator sees prompt-elicit failures rather
      // than a silent pass on whatever Haiku returned.
      if (result.reason === "judge_parse_error") {
        throw new Error(
          `Haiku returned unparseable output; prompt tuning needed. details: ${JSON.stringify(result.details)}`,
        );
      }
    });

    test("clearly-theatrical input → verdict='fail' (unambiguous discrimination)", async () => {
      const text =
        "Hi!!! So thrilled you booked!!! Amazing news!!! Best ever!!! Can't wait!!! Yay!!!";
      const result = await invokeHaikuJudge(text, "host-to-guest", 18, 3);

      expect(result.judge_id).toBe("exclamation_cap");
      if (result.reason === "judge_parse_error") {
        throw new Error(
          `Haiku returned unparseable output on theatrical case; prompt tuning needed. details: ${JSON.stringify(result.details)}`,
        );
      }
      // This case is unambiguous enough to assert exact verdict; if real
      // Haiku passes it, the prompt's genuine-vs-theatrical discrimination
      // needs tuning.
      expect(result.verdict).toBe("fail");
    });

    test("parse robustness — real call returns valid shape regardless of incidental formatting", async () => {
      const text =
        "Booking confirmed for Friday! Cleaner scheduled for Saturday! All set!";
      const result = await invokeHaikuJudge(text, "host-to-guest", 4, 3);

      // Don't assert exact verdict — borderline-genuine input is where LLM
      // judgment legitimately varies. Just verify the parse path + shape.
      expect(result.judge_id).toBe("exclamation_cap");
      expect(["pass", "fail"]).toContain(result.verdict);
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);

      // Surface parse-error explicitly so an unparseable real-Haiku response
      // doesn't silently mask itself as a "passing" integration test.
      if (result.reason === "judge_parse_error") {
        throw new Error(
          `Haiku returned unparseable output on borderline case; prompt tuning needed. details: ${JSON.stringify(result.details)}`,
        );
      }
    });
  },
);
