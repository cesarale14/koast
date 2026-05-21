/**
 * J3 constitution-prompt anti-pattern registry — structural tests.
 * M10 Phase C STEP 5.
 *
 * SUBSTRATE-ONLY validation per locked (B): no live scan, no LLM. These
 * tests verify the catalog shape + the JUDGE_TARGETS registration is
 * internally consistent + references real files (phantom-file guard per
 * §7.7 convention-references-uninstantiated-mechanism).
 *
 * v2.8 LLM-judge driver (the runtime consumer) is a separate PR per
 * D34 (vi); these tests are the substrate validation layer.
 *
 * 5 tests; 706 → 711.
 */

import fs from "node:fs";
import path from "node:path";
import {
  CONSTITUTION_PROMPT_ANTI_PATTERNS,
  CONSTITUTION_PROMPT_JUDGE_TARGETS,
} from "@/lib/voice/constitution-anti-patterns";
import { CONSTITUTION_PROMPTS } from "@/lib/voice/anti-patterns.runner";

const ALLOWED_SEVERITIES = ["low", "medium", "high"] as const;
const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*[a-z0-9]$/;

/** Walk up from this test's directory to find repo root (package.json),
 *  mirroring the repoRoot() helper in anti-patterns.runner.ts. */
function repoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `constitution-anti-patterns.test: could not locate package.json walking up from ${__dirname}`,
  );
}

describe("CONSTITUTION_PROMPT_ANTI_PATTERNS — catalog shape", () => {
  test("catalog has at least one entry (completeness floor)", () => {
    expect(CONSTITUTION_PROMPT_ANTI_PATTERNS.length).toBeGreaterThan(0);
  });

  test("each entry has valid shape (id snake_case + non-empty description + non-empty rationale + allowed severity)", () => {
    for (const entry of CONSTITUTION_PROMPT_ANTI_PATTERNS) {
      expect(typeof entry.id).toBe("string");
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.id).toMatch(SNAKE_CASE_RE);
      expect(typeof entry.description).toBe("string");
      expect(entry.description.length).toBeGreaterThan(0);
      expect(typeof entry.rationale).toBe("string");
      expect(entry.rationale.length).toBeGreaterThan(0);
      expect(ALLOWED_SEVERITIES).toContain(entry.severity);
      if (entry.applies_to_section !== undefined) {
        expect(typeof entry.applies_to_section).toBe("string");
        expect(entry.applies_to_section.length).toBeGreaterThan(0);
      }
    }
  });

  test("catalog ids are unique (no duplicate entries)", () => {
    const ids = CONSTITUTION_PROMPT_ANTI_PATTERNS.map((e) => e.id);
    const seen = new Set(ids);
    expect(seen.size).toBe(ids.length);
  });
});

describe("CONSTITUTION_PROMPT_JUDGE_TARGETS — parallel registration", () => {
  test("JUDGE_TARGETS file_paths match CONSTITUTION_PROMPTS allow-list paths (consistency between D24-exclusion and v2.8-scan-target roles)", () => {
    const judgePaths = new Set(
      CONSTITUTION_PROMPT_JUDGE_TARGETS.map((t) => t.file_path),
    );
    const allowListPaths = new Set(CONSTITUTION_PROMPTS.map((c) => c.path));
    expect(judgePaths).toEqual(allowListPaths);
  });

  test("each JUDGE_TARGET file exists on disk (phantom-file guard per §7.7 convention-references-uninstantiated-mechanism)", () => {
    const root = repoRoot();
    for (const target of CONSTITUTION_PROMPT_JUDGE_TARGETS) {
      const abs = path.join(root, target.file_path);
      expect(fs.existsSync(abs)).toBe(true);
    }
  });
});
