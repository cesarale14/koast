/**
 * Unread-count display formatter — M8 Phase G C4.
 *
 * The /api/audit-feed/unread-count endpoint formats the integer count
 * into the UI-facing display string per C4 R-7 (numeric badge with
 * "9+" overflow). Logic is verbatim from the route handler; mirrored
 * here so we can unit-test without spinning up the API surface.
 *
 * Per C4 sign-off:
 *   - count == 0  → null (badge hidden)
 *   - count 1-9   → "1".."9"
 *   - count >= 10 → "9+"
 *   - server-side count cap = 100 (NULL last_seen treated as "all unread")
 */

const COUNT_HARD_CAP = 100;

function formatDisplay(count: number): string | null {
  if (count <= 0) return null;
  if (count >= 10) return "9+";
  return String(count);
}

describe("audit unread-count formatDisplay (C4 R-7)", () => {
  test("count=0 → null (badge hidden)", () => {
    expect(formatDisplay(0)).toBeNull();
  });

  test("count=1..9 → numeric string", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(formatDisplay(n)).toBe(String(n));
    }
  });

  test("count=10 → '9+' overflow", () => {
    expect(formatDisplay(10)).toBe("9+");
  });

  test("count >= 10 (NULL last_seen capped case) → '9+'", () => {
    expect(formatDisplay(99)).toBe("9+");
    expect(formatDisplay(COUNT_HARD_CAP)).toBe("9+");
    expect(formatDisplay(COUNT_HARD_CAP * 10)).toBe("9+");
  });

  test("negative count (defensive) → null", () => {
    expect(formatDisplay(-1)).toBeNull();
  });
});
