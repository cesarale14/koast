import { applyGuestReplyEdit } from "../edit-payload";

describe("applyGuestReplyEdit (P6.5 — edit→send payload path)", () => {
  const prev = {
    block: {
      kind: "guest_reply",
      data: { channel: "airbnb", guestName: "Sam", propertyName: "Villa", messageText: "Original draft" },
    },
    action: { bookingId: "b-1", messageText: "Original draft" },
    judge_results: [{ judge: "j1" }],
  };

  test("the edited text replaces messageText in BOTH action (what sends) and block (what shows)", () => {
    const { nextPayload } = applyGuestReplyEdit(prev, "Edited final");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((nextPayload.action as any).messageText).toBe("Edited final");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((nextPayload.block as any).data.messageText).toBe("Edited final");
  });

  test("entity ids in action are preserved (only the text changes)", () => {
    const { nextPayload } = applyGuestReplyEdit(prev, "Edited final");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((nextPayload.action as any).bookingId).toBe("b-1");
  });

  test("returns the prior text for the audit log (original → final)", () => {
    const { originalText } = applyGuestReplyEdit(prev, "Edited final");
    expect(originalText).toBe("Original draft");
  });

  test("does NOT mutate the input payload", () => {
    applyGuestReplyEdit(prev, "Edited final");
    expect(prev.action.messageText).toBe("Original draft");
    expect(prev.block.data.messageText).toBe("Original draft");
  });

  test("null payload → action carries the text, originalText is null", () => {
    const { nextPayload, originalText } = applyGuestReplyEdit(null, "Edited final");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((nextPayload.action as any).messageText).toBe("Edited final");
    expect(originalText).toBeNull();
  });

  test("preserves other payload keys via spread (route overrides judge_results separately)", () => {
    const { nextPayload } = applyGuestReplyEdit(prev, "Edited final");
    expect(nextPayload.judge_results).toEqual([{ judge: "j1" }]);
  });
});
