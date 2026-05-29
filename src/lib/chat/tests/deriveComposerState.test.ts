import { deriveComposerState } from "../deriveComposerState";

describe("deriveComposerState — M13 Phase 1.B X1 double-send lock", () => {
  test("empty when nothing pending/streaming and no draft", () => {
    expect(
      deriveComposerState({ isPending: false, isStreaming: false, draftLength: 0 }),
    ).toBe("empty");
  });

  test("typing when draft present and not in flight", () => {
    expect(
      deriveComposerState({ isPending: false, isStreaming: false, draftLength: 5 }),
    ).toBe("typing");
  });

  test("blocked while streaming", () => {
    expect(
      deriveComposerState({ isPending: false, isStreaming: true, draftLength: 0 }),
    ).toBe("blocked");
  });

  test("blocked while PENDING (the X1 gap: submit fired, turn_started not yet) — even with a draft", () => {
    // This is the core X1 assertion: between onSubmit and turn_started,
    // status is still "idle" so isStreaming is false, but isPending is
    // true → composer must be locked so a second send can't fire with a
    // null conversation_id.
    expect(
      deriveComposerState({ isPending: true, isStreaming: false, draftLength: 0 }),
    ).toBe("blocked");
    expect(
      deriveComposerState({ isPending: true, isStreaming: false, draftLength: 12 }),
    ).toBe("blocked");
  });

  test("blocked when both pending and streaming", () => {
    expect(
      deriveComposerState({ isPending: true, isStreaming: true, draftLength: 3 }),
    ).toBe("blocked");
  });

  test("unlocks (typing) the moment pending clears with a draft still present (post-error retry)", () => {
    // After a fast failure (error before turn_started), isPending clears
    // via the finally block; the host's draft may still be there → they
    // can retry. Composer must be usable, not stuck blocked.
    expect(
      deriveComposerState({ isPending: false, isStreaming: false, draftLength: 8 }),
    ).toBe("typing");
  });
});
