/**
 * voice-scan-constitution — CI-time activation script for J3-vi
 * (deferred_constitution_prompt_quote_vs_instance).
 *
 * Scans CONSTITUTION_PROMPTS files (build-voice-prompt.ts +
 * agent/system-prompt.ts per src/lib/voice/anti-patterns.runner.ts) for
 * banned-phrase regex matches and uses the quote-vs-instance LLM
 * classifier to distinguish PEDAGOGICAL QUOTATION (legitimate negative-
 * example training) from DECLARATIVE USE (real prompt-text the LLM
 * would emit).
 *
 * Activation surface: npm run voice:scan:constitution.
 * Exit code: 0 if no declarative-use violations; 1 if any found.
 * Stdout: per-match report (file:line:phrase:context).
 *
 * Repo-root resolution: walks up from this script to find package.json,
 * then resolves CONSTITUTION_PROMPTS paths against repo root.
 *
 * Per Phase D STOP §3.5: this script is the consumer for
 * deferred_constitution_prompt_quote_vs_instance; homomorphic with v
 * (voice-scan-doctrine) — shares src/lib/agent/judge/quote-vs-instance.ts
 * classifier, differs only in target file set + judge_id + targetClass.
 */

import fs from "node:fs";
import path from "node:path";

import { PHASE_F_SHIP } from "@/lib/voice/anti-patterns";
import { CONSTITUTION_PROMPTS } from "@/lib/voice/anti-patterns.runner";
import { findAllMatches } from "@/lib/agent/patterns/types";
import { judgeQuoteVsInstance } from "@/lib/agent/judge/quote-vs-instance";

const CONTEXT_WINDOW = 50;

export interface ScanViolation {
  filePath: string;
  line: number;
  patternId: string;
  doctrineSection: string;
  matchedPhrase: string;
  contextSnippet: string;
  verdict: "fail";
  reason: string;
  confidence: number;
}

/**
 * Repo-root walker (matches src/lib/voice/anti-patterns.runner.ts shape).
 */
function repoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `voice-scan-constitution: could not locate package.json walking up from ${__dirname}`,
  );
}

/**
 * Core scan against an arbitrary text + filePath (dependency-injected
 * for testability). Mirrors scanDoctrineText shape; differs only in
 * targetClass + judgeId.
 */
export async function scanConstitutionText(
  text: string,
  filePath: string,
): Promise<ScanViolation[]> {
  const violations: ScanViolation[] = [];

  const matches = findAllMatches(text, PHASE_F_SHIP);

  for (const m of matches) {
    const start = Math.max(0, m.index - CONTEXT_WINDOW);
    const end = Math.min(text.length, m.index + m.matchedText.length + CONTEXT_WINDOW);
    const contextSnippet = text.slice(start, end).replace(/\s+/g, " ").trim();
    const line = text.slice(0, m.index).split("\n").length;

    const result = await judgeQuoteVsInstance({
      matchedPhrase: m.matchedText,
      contextSnippet,
      targetClass: "constitution",
      judgeId: "constitution_prompt_quote_vs_instance",
    });

    if (result.verdict === "fail") {
      violations.push({
        filePath,
        line,
        patternId: m.entry.id,
        doctrineSection: (m.entry as unknown as { doctrine_section: string })
          .doctrine_section,
        matchedPhrase: m.matchedText,
        contextSnippet,
        verdict: "fail",
        reason: result.reason,
        confidence: result.confidence,
      });
    }
  }

  return violations;
}

/**
 * Scan all CONSTITUTION_PROMPTS files. Reads each via fs.readFileSync;
 * aggregates per-file scanConstitutionText results.
 */
export async function scanConstitutionPrompts(): Promise<ScanViolation[]> {
  const root = repoRoot();
  const allViolations: ScanViolation[] = [];

  for (const entry of CONSTITUTION_PROMPTS) {
    const abs = path.join(root, entry.path);
    const text = fs.readFileSync(abs, "utf8");
    const fileViolations = await scanConstitutionText(text, entry.path);
    allViolations.push(...fileViolations);
  }

  return allViolations;
}

function formatViolation(v: ScanViolation): string {
  return `${v.filePath}:${v.line}: [${v.patternId}] "${v.matchedPhrase}" — ${v.reason} (conf=${v.confidence.toFixed(2)})
  context: ${v.contextSnippet}
  doctrine_section: ${v.doctrineSection}`;
}

async function main(): Promise<void> {
  const fileList = CONSTITUTION_PROMPTS.map((e) => e.path).join(", ");
  process.stdout.write(`voice-scan-constitution: scanning ${fileList}\n`);

  let violations: ScanViolation[];
  try {
    violations = await scanConstitutionPrompts();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`voice-scan-constitution: scan failed — ${msg}\n`);
    process.exit(2);
  }

  if (violations.length === 0) {
    process.stdout.write(
      "voice-scan-constitution: clean (no declarative-use violations).\n",
    );
    process.exit(0);
  }

  process.stdout.write(
    `voice-scan-constitution: ${violations.length} declarative-use violation(s):\n\n`,
  );
  for (const v of violations) {
    process.stdout.write(formatViolation(v) + "\n\n");
  }
  process.exit(1);
}

if (require.main === module) {
  void main();
}
