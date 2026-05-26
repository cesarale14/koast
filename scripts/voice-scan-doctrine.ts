/**
 * voice-scan-doctrine — CI-time activation script for J3-v
 * (deferred_voice_doctrine_self_scan).
 *
 * Scans method/voice-doctrine.md (vault canonical) for banned-phrase
 * regex matches and uses the quote-vs-instance LLM classifier to
 * distinguish PEDAGOGICAL QUOTATION (legitimate) from DECLARATIVE USE
 * (real voice violation in the doctrine's own prose).
 *
 * Activation surface: npm run voice:scan:doctrine.
 * Exit code: 0 if no declarative-use violations; 1 if any found.
 * Stdout: per-match report (file:line:phrase:context).
 *
 * Vault path resolution:
 *   - Default: ~/koast-vault/method/voice-doctrine.md (per CLAUDE.md vault layout)
 *   - Override: KOAST_DOCTRINE_PATH env var
 *
 * Per Phase D STOP §3.4: this script is the consumer for
 * deferred_voice_doctrine_self_scan; transitioning the catalog stub
 * to runtime_active=true + judge_id="voice_doctrine_self_scan" makes
 * this script the live runtime.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PHASE_F_SHIP } from "@/lib/voice/anti-patterns";
import { findAllMatches } from "@/lib/agent/patterns/types";
import { judgeQuoteVsInstance } from "@/lib/agent/judge/quote-vs-instance";

const DEFAULT_VAULT_DOCTRINE = path.join(
  os.homedir(),
  "koast-vault",
  "method",
  "voice-doctrine.md",
);

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
 * Core scan against an arbitrary text + filePath (dependency-injected for
 * testability). Used by both the file-reading scanDoctrine variant + the
 * direct-text scanDoctrineText variant.
 */
export async function scanDoctrineText(
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
      targetClass: "doctrine",
      judgeId: "voice_doctrine_self_scan",
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

export async function scanDoctrine(
  filePath: string = process.env.KOAST_DOCTRINE_PATH ?? DEFAULT_VAULT_DOCTRINE,
): Promise<ScanViolation[]> {
  const text = fs.readFileSync(filePath, "utf8");
  return scanDoctrineText(text, filePath);
}

function formatViolation(v: ScanViolation): string {
  return `${v.filePath}:${v.line}: [${v.patternId}] "${v.matchedPhrase}" — ${v.reason} (conf=${v.confidence.toFixed(2)})
  context: ${v.contextSnippet}
  doctrine_section: ${v.doctrineSection}`;
}

async function main(): Promise<void> {
  const targetPath = process.env.KOAST_DOCTRINE_PATH ?? DEFAULT_VAULT_DOCTRINE;
  process.stdout.write(`voice-scan-doctrine: scanning ${targetPath}\n`);

  let violations: ScanViolation[];
  try {
    violations = await scanDoctrine(targetPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`voice-scan-doctrine: scan failed — ${msg}\n`);
    process.exit(2);
  }

  if (violations.length === 0) {
    process.stdout.write(
      "voice-scan-doctrine: clean (no declarative-use violations).\n",
    );
    process.exit(0);
  }

  process.stdout.write(
    `voice-scan-doctrine: ${violations.length} declarative-use violation(s):\n\n`,
  );
  for (const v of violations) {
    process.stdout.write(formatViolation(v) + "\n\n");
  }
  process.exit(1);
}

// Entry-point guard — only run main() if invoked directly (allows
// import from tests without firing the script body).
if (require.main === module) {
  void main();
}
