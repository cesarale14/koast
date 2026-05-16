/**
 * Voice anti-pattern catalog tests — M9 Phase F D24 shape-regex CI layer.
 *
 * Three describe blocks per /ultraplan Q-F6 + STEP 7.3 spec:
 *
 *   1. catalog completeness — introspection: every PHASE_F_SHIP id has a
 *      fixture line; every PHASE_F_DEFER_TO_M10 stub is well-formed.
 *      Catches catalog-fixture drift in the same PR.
 *
 *   2. meta-tests — proves the catalog itself works against curated
 *      fixtures: all-patterns covers every id; clean stays clean;
 *      edge-cases match their declared expectedMatches arrays exactly.
 *
 *   3. prompt-bearing file scan — proves the shipped LLM call-site
 *      prompts don't contain banned phrases. Failure format per Q-F5
 *      (file:line, pattern id, doctrine section, rationale, ±20 char
 *      context). This is the actual D24 enforcement layer.
 */

import fs from "node:fs";
import path from "node:path";
import { findAllMatches } from "@/lib/agent/patterns/types";
import {
  PHASE_F_SHIP,
  PHASE_F_DEFER_TO_M10,
} from "../anti-patterns";
import {
  PROMPT_BEARING_FILES,
  CONSTITUTION_PROMPTS,
  scanFile,
} from "../anti-patterns.runner";
import { ALL_PATTERNS_FIXTURE } from "../fixtures/all-patterns.fixture";
import { CLEAN_FIXTURE } from "../fixtures/clean.fixture";
import { EDGE_CASES } from "../fixtures/edge-cases.fixture";

// =====================================================================
// 1. Catalog completeness
// =====================================================================

describe("Voice anti-pattern catalog — completeness", () => {
  test("every PHASE_F_SHIP entry has well-formed shape", () => {
    expect(PHASE_F_SHIP.length).toBeGreaterThan(0);
    const seenIds = new Set<string>();
    for (const entry of PHASE_F_SHIP) {
      // Stable id format.
      expect(entry.id).toMatch(/^[a-z][a-z0-9_]+$/);
      // No duplicate ids.
      expect(seenIds.has(entry.id)).toBe(false);
      seenIds.add(entry.id);
      // Kind locked.
      expect(entry.kind).toBe("voice-anti-pattern");
      // Required voice fields populated.
      expect(entry.doctrine_section).toMatch(/§5\./);
      expect(entry.rationale.length).toBeGreaterThan(10);
      expect(["ban", "stacked-ban"]).toContain(entry.severity);
      // Regex compiles.
      expect(() => new RegExp(entry.pattern, "gim")).not.toThrow();
    }
  });

  test("every PHASE_F_DEFER_TO_M10 stub is well-formed", () => {
    expect(PHASE_F_DEFER_TO_M10.length).toBeGreaterThan(0);
    for (const stub of PHASE_F_DEFER_TO_M10) {
      expect(stub.id).toMatch(/^deferred_[a-z0-9_]+$/);
      expect(stub.doctrine_section.length).toBeGreaterThan(0);
      expect(stub.rationale_for_deferral.length).toBeGreaterThan(20);
      expect(["llm-judge", "output-filter"]).toContain(stub.planned_layer);
    }
  });

  test("every PHASE_F_SHIP id appears in all-patterns.fixture.ts", () => {
    // Introspection: parse the fixture's `// pattern: <id>` delineation
    // comments and assert every catalog id is represented. This forces
    // same-PR fixture additions when the catalog grows.
    const fixtureIds = new Set<string>();
    const re = /\/\/\s*pattern:\s*([a-z][a-z0-9_]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ALL_PATTERNS_FIXTURE)) !== null) {
      fixtureIds.add(m[1]);
    }
    const missing = PHASE_F_SHIP.map((e) => e.id).filter((id) => !fixtureIds.has(id));
    expect(missing).toEqual([]);
  });

  test("every all-patterns.fixture.ts id corresponds to a catalog entry", () => {
    // Reverse direction: no orphan fixture lines (removed catalog entries
    // get their fixture line removed in the same PR).
    const catalogIds = new Set(PHASE_F_SHIP.map((e) => e.id));
    const re = /\/\/\s*pattern:\s*([a-z][a-z0-9_]+)/g;
    let m: RegExpExecArray | null;
    const orphans: string[] = [];
    while ((m = re.exec(ALL_PATTERNS_FIXTURE)) !== null) {
      if (!catalogIds.has(m[1])) orphans.push(m[1]);
    }
    expect(orphans).toEqual([]);
  });
});

// =====================================================================
// 2. Meta-tests against fixtures
// =====================================================================

describe("Voice anti-pattern catalog — meta-tests", () => {
  test("all-patterns.fixture catches every PHASE_F_SHIP id (≥1 match)", () => {
    const matches = findAllMatches(ALL_PATTERNS_FIXTURE, PHASE_F_SHIP);
    const hit = new Set(matches.map((m) => m.entry.id));
    const missed = PHASE_F_SHIP.map((e) => e.id).filter((id) => !hit.has(id));
    if (missed.length > 0) {
      // Surface which entries failed for fast diagnosis (regex regression
      // vs out-of-date fixture line).
      throw new Error(
        `Catalog ids with no fixture match (regex or fixture broke): ${missed.join(", ")}`,
      );
    }
    expect(missed).toEqual([]);
  });

  test("clean.fixture produces zero matches", () => {
    const matches = findAllMatches(CLEAN_FIXTURE, PHASE_F_SHIP);
    if (matches.length > 0) {
      const lines = matches
        .map(
          (m) =>
            `  - ${m.entry.id} matched "${m.matchedText}" at index ${m.index}`,
        )
        .join("\n");
      throw new Error(
        `clean.fixture should match zero patterns. Got ${matches.length} match(es):\n${lines}\n\nRefine the over-broad regex; do not edit clean.fixture to dodge the catch.`,
      );
    }
    expect(matches).toEqual([]);
  });

  test.each(Object.entries(EDGE_CASES))(
    "edge case %s matches expectedMatches exactly",
    (caseId, edgeCase) => {
      const matches = findAllMatches(edgeCase.text, PHASE_F_SHIP);
      const actualIds = Array.from(new Set(matches.map((m) => m.entry.id))).sort();
      const expectedIds = [...edgeCase.expectedMatches].sort();
      if (actualIds.join(",") !== expectedIds.join(",")) {
        throw new Error(
          `Edge case "${caseId}" expected ${JSON.stringify(expectedIds)}, got ${JSON.stringify(actualIds)}.\nRationale: ${edgeCase.rationale}`,
        );
      }
      expect(actualIds).toEqual(expectedIds);
    },
  );
});

// =====================================================================
// 3. Prompt-bearing file scan (D24 enforcement layer)
// =====================================================================

describe("Voice anti-pattern catalog — call-site prompt scan (D24 enforcement)", () => {
  test("every PROMPT_BEARING_FILES + CONSTITUTION_PROMPTS path exists", () => {
    // Self-protection: if a path is wrong, scanFile would throw ENOENT.
    // Surface that as a discrete failure rather than a confusing scan
    // error. Covers both lists so STEP 9 §7.8 same-PR discipline is
    // enforceable end-to-end.
    const repo = path.resolve(__dirname, "..", "..", "..", "..");
    for (const f of PROMPT_BEARING_FILES) {
      const abs = path.join(repo, f);
      expect(fs.existsSync(abs)).toBe(true);
    }
    for (const c of CONSTITUTION_PROMPTS) {
      const abs = path.join(repo, c.path);
      expect(fs.existsSync(abs)).toBe(true);
    }
  });

  test.each(PROMPT_BEARING_FILES)(
    "%s contains no voice anti-pattern matches",
    (filePath) => {
      const matches = scanFile(filePath);
      if (matches.length > 0) {
        // Failure message per /ultraplan Q-F5.
        const formatted = matches
          .map(
            (m) =>
              [
                `Voice anti-pattern detected: ${m.entry.id}`,
                `  File: ${m.filePath}:${m.line}`,
                `  Doctrine: ${m.entry.doctrine_section}`,
                `  Rationale: ${m.entry.rationale}`,
                `  Severity: ${m.entry.severity}`,
                `  Match: "...${m.contextSnippet}..."`,
              ].join("\n"),
          )
          .join("\n\n");
        throw new Error(`\n${formatted}\n`);
      }
      expect(matches).toEqual([]);
    },
  );

  // Constitution prompts (build-voice-prompt.ts, agent/system-prompt.ts)
  // are surfaced via test.skip with explicit rationale rather than
  // invisibly excluded, so the deferred coverage shows in jest output.
  // Inheritance: PHASE_F_DEFER_TO_M10.constitution_prompt_quote_vs_instance
  // + v2.6 §3 D24 body (structural scope) + §6.9 (M10 inheritance) + §7.8
  // (allow-list bifurcation discipline).
  for (const cp of CONSTITUTION_PROMPTS) {
    test.skip(`${cp.path} — constitution prompt, deferred to M10 LLM judge (§6.9): ${cp.rationale}`, () => {
      // Intentionally empty: deferred surface marker.
    });
  }
});
