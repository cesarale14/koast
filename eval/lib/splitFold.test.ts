/**
 * splitFold detector — deterministic gate proving it catches the fold WITHOUT
 * needing the model to actually fold (the item-5 lesson), and that it does NOT
 * re-introduce the brittle literal-token problem: correct-but-varied phrasing
 * must register as NO fold (the phrasings that false-failed mentionAny["two"]).
 */
import { detectsSplitFold } from "./splitFold";

describe("detectsSplitFold — checkout-split prose fold guard", () => {
  it("DETECTS the fold (Harbor's upcoming checkout mis-attributed to today)", () => {
    expect(detectsSplitFold("Three checkouts at Harbor House today, including Jeremy.")).toBe(true);
    expect(detectsSplitFold("Harbor House has three checkouts today.")).toBe(true);
    expect(detectsSplitFold("Today you've got three checkouts at Harbor House.")).toBe(true);
    expect(detectsSplitFold("3 checkouts at Harbor today, plus turnovers.")).toBe(true);
  });

  it("does NOT flag CORRECT outputs — including the phrasings that false-failed the token-match", () => {
    // The correct today-total stated with the per-property split.
    expect(detectsSplitFold("Three checkouts today — two at Harbor House including Jeremy, and one at Dockside Flat.")).toBe(false);
    // The phrasings that broke mentionAny["two"] (correct, no literal "two").
    expect(detectsSplitFold("Jeremy plus one more at Harbor today, plus one checking out upcoming.")).toBe(false);
    expect(detectsSplitFold("Two checkouts at Harbor House today, and one more on June 3.")).toBe(false);
    expect(detectsSplitFold("You have two departures at Harbor today; a third checks out tomorrow.")).toBe(false);
  });
});
