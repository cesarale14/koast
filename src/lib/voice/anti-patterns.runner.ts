/**
 * Runner + allow-list for the voice anti-pattern shape-regex CI layer.
 *
 * The catalog (anti-patterns.ts) is data; the runner (this file) decides
 * WHICH FILES the catalog scans. Hard-coded literal list per /ultraplan
 * Q-F4 + R1 (no globs — new prompt modules require explicit same-PR
 * allow-list update; convention v2.6 §7.8 codifies the discipline).
 *
 * Q-F9 resolution (M9 Phase F STEP 7.1): agent loop's system prompt
 * lives at src/lib/agent/system-prompt.ts — real module, not inline
 * string. Allow-list resolves cleanly.
 */

import fs from "node:fs";
import path from "node:path";
import { findAllMatches } from "@/lib/agent/patterns/types";
import {
  PHASE_F_SHIP,
  type VoiceAntiPatternEntry,
} from "./anti-patterns";

/**
 * D24 enforcement boundary — structural distinction between two file
 * classes (locked at M9 Phase F STEP 7 PATH C):
 *
 *   - Call-site prompts (PROMPT_BEARING_FILES): direct output-generation
 *     surfaces. Voice violations here leak to users. No quote-vs-instance
 *     ambiguity — these prompts invoke the doctrine, they don't teach
 *     it. Gate value is high; D24 enforces here.
 *
 *   - Constitution prompts (CONSTITUTION_PROMPTS): behavior-defining
 *     surfaces that teach the doctrine to the LLM. Negative-example
 *     pedagogy is legitimate technique here (citing banned phrases by
 *     name to train avoidance). Quote-vs-instance ambiguity is inherent
 *     to the file class. Deferred to M10 LLM judge.
 *
 * D24 v1 scope is structural ("which surfaces matter for output"), not
 * mechanism-shaped ("what syntax exempts content"). The boundary is the
 * answer; v2.6 §3 D24 body codifies it.
 *
 * Convention v2.6 §7.8 binds: adding a new call-site prompt module
 * requires adding its path to PROMPT_BEARING_FILES in the same PR;
 * adding a new constitution-prompt module requires adding its path to
 * CONSTITUTION_PROMPTS in the same PR (plus surfacing whether the v1
 * boundary still holds).
 */
export const PROMPT_BEARING_FILES: ReadonlyArray<string> = [
  // Call-site prompts: direct output generation. D24 enforces.
  "src/lib/claude/messaging.ts",       // generateDraft system prompt
  "src/lib/reviews/generator.ts",      // generateGuestReview / -Response / -FromIncoming
];

/**
 * Constitution prompts — behavior-defining surfaces that teach the
 * doctrine. Documented deferred surface (same role PHASE_F_DEFER_TO_M10
 * plays for patterns). NOT scanned by the runner; the deferred test
 * cases in anti-patterns.test.ts use these to surface the boundary in
 * jest output via test.skip rather than invisibly excluding them.
 *
 * The companion catalog stub `constitution_prompt_quote_vs_instance`
 * in PHASE_F_DEFER_TO_M10 pairs with this list — same architectural
 * class as `deferred_voice_doctrine_self_scan`.
 */
export type ConstitutionPromptEntry = {
  path: string;
  deferred_to: "m10-llm-judge";
  rationale: string;
};

export const CONSTITUTION_PROMPTS: ReadonlyArray<ConstitutionPromptEntry> = [
  {
    path: "src/lib/voice/build-voice-prompt.ts",
    deferred_to: "m10-llm-judge",
    rationale:
      "Negative-example pedagogy creates quote-vs-instance ambiguity inherent to constitution prompts. VOICE_DOCTRINE_SUMMARY cites banned phrases by name (corporate / chipper / over-hedged exemplars) as part of teaching the doctrine to the LLM.",
  },
  {
    path: "src/lib/agent/system-prompt.ts",
    deferred_to: "m10-llm-judge",
    rationale:
      "Negative-example pedagogy creates quote-vs-instance ambiguity inherent to constitution prompts. SYSTEM_PROMPT_TEXT cites banned sycophantic prefaces by name in identity + publisher-redirect sections to train avoidance.",
  },
];

/**
 * Documented runner-level exclusions. These paths legitimately contain
 * banned phrases (the catalog itself enumerates them; fixtures match
 * against them; voice-doctrine.md describes them). Listed here so the
 * exclusion rationale is visible in code, not folklore.
 *
 *   - src/lib/voice/anti-patterns.ts          (catalog source)
 *   - src/lib/voice/anti-patterns.runner.ts   (this file)
 *   - src/lib/voice/fixtures/*                (fixture files)
 *   - src/lib/voice/__tests__/                (catalog tests)
 *   - ~/koast-vault/method/voice-doctrine.md  (canonical doctrine; per R3,
 *                                              self-scan deferred to M10
 *                                              when judge can distinguish
 *                                              quote-from-instance)
 */
export const PROMPT_BEARING_EXCLUSIONS: ReadonlyArray<string> = [
  "src/lib/voice/anti-patterns.ts",
  "src/lib/voice/anti-patterns.runner.ts",
  "src/lib/voice/fixtures/",
  "src/lib/voice/__tests__/",
  "method/voice-doctrine.md (vault)",
];

/**
 * Resolve a repo-relative path to an absolute path under the project root.
 * Project root resolution: walks up from this module's directory until it
 * finds package.json, matching the standard Next.js/Node convention.
 */
function repoRoot(): string {
  let dir = __dirname;
  // Walk up at most 8 levels to find package.json. Tests + runner both
  // live under src/lib/voice/ so 4-5 levels is typical.
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `anti-patterns.runner: could not locate package.json walking up from ${__dirname}`,
  );
}

/**
 * Scan a single file against a catalog. Returns every match with file +
 * line + context. Callers (the test) format the failure message per
 * /ultraplan Q-F5 (file:line, pattern id, doctrine section, rationale,
 * ±20 char context).
 */
export type FileScanMatch = {
  entry: VoiceAntiPatternEntry;
  matchedText: string;
  index: number;
  filePath: string;
  line: number;
  contextSnippet: string;
};

export function scanFile(
  repoRelativePath: string,
  catalog: ReadonlyArray<VoiceAntiPatternEntry> = PHASE_F_SHIP,
): FileScanMatch[] {
  const abs = path.join(repoRoot(), repoRelativePath);
  const text = fs.readFileSync(abs, "utf8");
  // findAllMatches is generic over the base PatternEntry shape; we know
  // the catalog members are VoiceAntiPatternEntry (subtype) and cast the
  // entry reference back so callers get the voice-specific fields.
  const raw = findAllMatches(text, catalog);
  return raw.map((m) => {
    const line = text.slice(0, m.index).split("\n").length;
    const start = Math.max(0, m.index - 20);
    const end = Math.min(text.length, m.index + m.matchedText.length + 20);
    const contextSnippet = text.slice(start, end).replace(/\s+/g, " ").trim();
    return {
      entry: m.entry as VoiceAntiPatternEntry,
      matchedText: m.matchedText,
      index: m.index,
      filePath: repoRelativePath,
      line,
      contextSnippet,
    };
  });
}
