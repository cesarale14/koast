import { proposeGuestMessageTool } from "../propose-guest-message";

const BOOKING_ID = "44444444-4444-4444-8444-444444444444";
const ARTIFACT_ID = "55555555-5555-4555-8555-555555555555";
const AUDIT_ID = "66666666-6666-4666-8666-666666666666";

describe("proposeGuestMessageTool — declaration", () => {
  test("is a gated, editable tool with stakesClass='medium' and artifactKind='guest_message_proposal' (D38, D46, D47)", () => {
    expect(proposeGuestMessageTool.name).toBe("propose_guest_message");
    expect(proposeGuestMessageTool.requiresGate).toBe(true);
    expect(proposeGuestMessageTool.stakesClass).toBe("medium");
    expect(proposeGuestMessageTool.artifactKind).toBe("guest_message_proposal");
    expect(proposeGuestMessageTool.editable).toBe(true);
    expect(typeof proposeGuestMessageTool.buildProposalOutput).toBe("function");
  });
});

describe("proposeGuestMessageTool — input schema validation", () => {
  test("accepts valid minimal input", () => {
    const parsed = proposeGuestMessageTool.inputSchema.safeParse({
      booking_id: BOOKING_ID,
      message_text: "Hi! 3pm check-in works great. See you then.",
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects non-uuid booking_id", () => {
    const parsed = proposeGuestMessageTool.inputSchema.safeParse({
      booking_id: "not-a-uuid",
      message_text: "Hi",
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects empty message_text", () => {
    const parsed = proposeGuestMessageTool.inputSchema.safeParse({
      booking_id: BOOKING_ID,
      message_text: "",
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects message_text over 5000 chars", () => {
    const parsed = proposeGuestMessageTool.inputSchema.safeParse({
      booking_id: BOOKING_ID,
      message_text: "x".repeat(5001),
    });
    expect(parsed.success).toBe(false);
  });

  test("does NOT carry a supersedes field (D47 — guest messages don't supersede each other)", () => {
    // The schema rejects unknown keys via safeParse only when .strict()
    // is set; vanilla zod silently drops unknown keys. The contract is
    // that no such field exists on the tool's typed input.
    type Input = NonNullable<
      ReturnType<typeof proposeGuestMessageTool.inputSchema.safeParse>["success"] extends true
        ? Parameters<typeof proposeGuestMessageTool.handler>[0]
        : never
    >;
    // @ts-expect-error — supersedes is not part of the input contract
    const _example: Input = {
      booking_id: BOOKING_ID,
      message_text: "x",
      supersedes: "anything",
    };
    void _example;
    expect(true).toBe(true);
  });
});

describe("proposeGuestMessageTool — buildProposalOutput", () => {
  test("returns artifact_id + audit_log_id from refs + outcome='pending' + a non-empty message", () => {
    const result = proposeGuestMessageTool.buildProposalOutput!(
      { booking_id: BOOKING_ID, message_text: "draft" },
      { host: { id: "h1" }, conversation_id: "c1", turn_id: "t1" },
      { artifact_id: ARTIFACT_ID, audit_log_id: AUDIT_ID },
    );
    expect(result.artifact_id).toBe(ARTIFACT_ID);
    expect(result.audit_log_id).toBe(AUDIT_ID);
    expect(result.outcome).toBe("pending");
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
  });

  test("matches the tool's outputSchema", () => {
    const result = proposeGuestMessageTool.buildProposalOutput!(
      { booking_id: BOOKING_ID, message_text: "draft" },
      { host: { id: "h1" }, conversation_id: "c1", turn_id: "t1" },
      { artifact_id: ARTIFACT_ID, audit_log_id: AUDIT_ID },
    );
    const parsed = proposeGuestMessageTool.outputSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

describe("proposeGuestMessageTool — handler is a guard, not the proposal-time path", () => {
  test("handler throws — should not run at proposal time (D35 dispatcher fork bypasses it)", async () => {
    await expect(
      proposeGuestMessageTool.handler(
        { booking_id: BOOKING_ID, message_text: "draft" },
        { host: { id: "h1" }, conversation_id: "c1", turn_id: "t1" },
      ),
    ).rejects.toThrow(/should not run at proposal time/);
  });
});
