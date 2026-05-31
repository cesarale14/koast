/**
 * chat-eval — reusable agent-behavior eval harness (the analog of the
 * Playwright harness for fuzzy chat-output quality). NOT agenda-specific.
 *
 * runPromptThroughLoop: sends a prompt through the REAL agent loop (real
 * model, staging DB) and captures the streamed text. runChatJudges: runs the
 * existing output judges against chat output (audience="koast-to-host").
 * The deterministic assertions (no-visibility deflection, UUID leak, grounded-
 * in) are the hard pass/fail; the judges are a reported signal.
 *
 * Dynamic-imported by the entry AFTER loadEvalEnv() so the `@/` service
 * clients see the env.
 */

// Side-effect import: registers the 4 tools (read_memory, write_memory_fact,
// read_guest_thread, propose_guest_message). The turn ROUTE does this in
// production; the loop itself doesn't, so the eval must — otherwise the tool
// registry is empty and the model improvises tool calls as text.
import "@/lib/agent/tools";
import { runAgentTurn } from "@/lib/agent/loop";
import { applyOutputJudges } from "@/lib/agent/judge/apply-output-judges";
import type { JudgeResult } from "@/lib/agent/patterns/judge-types";

export interface LoopRunResult {
  text: string;
  conversationId: string | null;
  toolCalls: string[];
  error: string | null;
  /** Phase D: the render payload emitted this turn (a `render` SSE event), or
   * null if the turn produced no card. Used by the when-to-card behavior eval
   * (overview → present, narrow → absent). */
  renderPayload: unknown | null;
}

/** Run one prompt through the real loop; collect token text + tool-call names. */
export async function runPromptThroughLoop(
  hostId: string,
  prompt: string,
  uiContext?: { active_property_id?: string },
): Promise<LoopRunResult> {
  const parts: string[] = [];
  const toolCalls: string[] = [];
  let conversationId: string | null = null;
  let error: string | null = null;
  let renderPayload: unknown | null = null;
  try {
    for await (const ev of runAgentTurn({
      host: { id: hostId },
      conversation_id: null,
      user_message_text: prompt,
      ui_context: uiContext,
    })) {
      const e = ev as { type: string; delta?: string; conversation_id?: string; tool_name?: string; payload?: unknown };
      if (e.type === "turn_started" && e.conversation_id) conversationId = e.conversation_id;
      else if (e.type === "token" && e.delta) parts.push(e.delta);
      else if (e.type === "tool_call_started" && e.tool_name) toolCalls.push(e.tool_name);
      else if (e.type === "render") renderPayload = e.payload ?? null;
      else if (e.type === "error") error = JSON.stringify(ev);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  return { text: parts.join("").trim(), conversationId, toolCalls, error, renderPayload };
}

/**
 * Run the existing output judges on chat output (koast-to-host audience).
 *
 * `skipSurfaceFormJudges`: for prompts whose answer reproduces VERBATIM
 * quoted/forwarded guest content (e.g. showing a message thread), the
 * surface-form judges (emoji_policy, exclamation_cap) false-positive — the
 * "!" / emoji belong to the guest's text, not the agent's voice. Skipping
 * them there isn't lowering the bar: the SEMANTIC judges (performative-
 * thoroughness, filler, self-narration, ensure-verb-chain) still judge the
 * agent's own framing around the quote.
 */
export async function runChatJudges(
  text: string,
  skipSurfaceFormJudges = false,
): Promise<JudgeResult[]> {
  if (!text) return [];
  // Minimal base envelope — the judges read `text`, not the envelope.
  const baseEnvelope = {
    content: text,
    confidence: "high_inference",
    source_attribution: [],
  } as unknown as Parameters<typeof applyOutputJudges>[3];
  const policyOverride = skipSurfaceFormJudges
    ? { skip_judges: ["emoji_policy", "exclamation_cap"] as JudgeResult["judge_id"][] }
    : undefined;
  const { envelope } = await applyOutputJudges(
    text,
    "koast-to-host",
    "neutral",
    baseEnvelope,
    policyOverride,
  );
  return envelope.judge_results ?? [];
}

// ---------- deterministic assertions (hard pass/fail) ----------

// The deflection detector (regexes + deflectsVisibility) lives in ./deflection —
// a PURE, zero-dependency module so it can be canaried with a deterministic unit
// test (eval/lib/deflection.test.ts). Re-exported here so callers are unchanged.
export { deflectsVisibility } from "./deflection";

const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** True if any UUID leaked into host-facing text (no-ids rule). */
export function leaksUuid(text: string): boolean {
  return UUID.test(text);
}

/** Raw markdown the plain-text chat surface would render literally. The judges
 * check semantics, not structure — this deterministic check catches the class
 * (** bold, # headers, "- "/"* " bullet lists). Returns the kinds found. */
export function rawMarkdown(text: string): string[] {
  const found: string[] = [];
  if (/\*\*/.test(text)) found.push("bold(**)");
  if (/^\s{0,3}#{1,6}\s/m.test(text)) found.push("header(#)");
  if (/^\s*[-*]\s+\S/m.test(text)) found.push("bullet(-/*)");
  return found;
}

/** True if EVERY required natural-reference term appears (grounding). */
export function groundedIn(text: string, requiredTerms: string[]): { ok: boolean; missing: string[] } {
  const lower = text.toLowerCase();
  const missing = requiredTerms.filter((t) => !lower.includes(t.toLowerCase()));
  return { ok: missing.length === 0, missing };
}

/** Heuristic generic-checklist shape: a pile of rhetorical questions and/or
 * generic urgency buckets with no concrete grounding. Reported, not a hard
 * gate (the performative-thoroughness judge is the real signal). */
export function looksLikeGenericChecklist(text: string): boolean {
  const questionMarks = (text.match(/\?/g) ?? []).length;
  const genericBuckets = /\b(immediate|soon|ongoing|usually urgent|typically|generally)\b/i.test(text);
  return questionMarks >= 3 && genericBuckets;
}

export function judgeVerdicts(results: JudgeResult[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of results) out[r.judge_id] = r.verdict;
  return out;
}
