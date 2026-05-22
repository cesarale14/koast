/**
 * PendingDraftBubble confidence-label accessibility lock tests.
 * M10 Phase D STEP 8 (S3) — runtime validation of §13.1 accessibility lock.
 *
 * Pure unit test against the exported CONFIDENCE_LABEL map. The codebase has
 * no React Testing Library setup (jest config testEnvironment='node';
 * testMatch matches only TypeScript .test.ts files); DOM/render behavior is
 * covered by visual operator-attestation per §4.2 amendment.
 *
 * Coverage:
 *   1. All 3 confidence states have non-empty label text (accessibility:
 *      label MANDATORY, not color-only).
 *   2. Variant assignment matches the locked palette (success / warning /
 *      danger → lagoon / amber-tide / coral-reef per KoastChip variants).
 *
 * 2 tests; 722 → 724.
 */

import { CONFIDENCE_LABEL } from "@/components/dashboard/draft-envelope-labels";

describe("PendingDraftBubble — §13.1 confidence-label accessibility lock", () => {
  test("each confidence state has a non-empty text label (accessibility — label carries meaning, not color alone)", () => {
    for (const state of ["confirmed", "high_inference", "active_guess"] as const) {
      const entry = CONFIDENCE_LABEL[state];
      expect(entry).toBeDefined();
      expect(typeof entry.label).toBe("string");
      expect(entry.label.length).toBeGreaterThan(0);
    }

    // Locked label strings (§13.1 — change here means a deliberate UX retitle,
    // not an accidental drift).
    expect(CONFIDENCE_LABEL.confirmed.label).toBe("Confirmed");
    expect(CONFIDENCE_LABEL.high_inference.label).toBe("High inference");
    expect(CONFIDENCE_LABEL.active_guess.label).toBe("Active guess");
  });

  test("variant mapping matches the locked palette (success / warning / danger)", () => {
    // Per ultraplan §2 S3-b: lagoon=success / amber-tide=warning / coral-reef=danger.
    expect(CONFIDENCE_LABEL.confirmed.variant).toBe("success");
    expect(CONFIDENCE_LABEL.high_inference.variant).toBe("warning");
    expect(CONFIDENCE_LABEL.active_guess.variant).toBe("danger");
  });
});
