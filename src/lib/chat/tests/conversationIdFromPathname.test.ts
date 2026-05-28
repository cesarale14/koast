import { conversationIdFromPathname } from "../conversationIdFromPathname";

describe("conversationIdFromPathname — pure extraction", () => {
  test("landing path → null", () => {
    expect(conversationIdFromPathname("/")).toBeNull();
  });

  test("canonical /chat without id → null", () => {
    expect(conversationIdFromPathname("/chat")).toBeNull();
  });

  test("/chat/<id> → <id>", () => {
    expect(conversationIdFromPathname("/chat/abc-123")).toBe("abc-123");
  });

  test("UUID style id", () => {
    expect(
      conversationIdFromPathname(
        "/chat/9d39b55d-f741-4945-8385-a0a59139612c",
      ),
    ).toBe("9d39b55d-f741-4945-8385-a0a59139612c");
  });

  test("trailing slash tolerated", () => {
    expect(conversationIdFromPathname("/chat/abc-123/")).toBe("abc-123");
  });

  test("query string stripped — defensive (usePathname() returns path-only in Next 14+)", () => {
    expect(conversationIdFromPathname("/chat/abc-123?foo=bar")).toBe("abc-123");
  });

  test("hash stripped", () => {
    expect(conversationIdFromPathname("/chat/abc-123#section")).toBe("abc-123");
  });

  test("nested segments → null (no /chat/<id>/<more>)", () => {
    expect(conversationIdFromPathname("/chat/abc/extra")).toBeNull();
  });

  test("non-chat routes → null", () => {
    expect(conversationIdFromPathname("/calendar")).toBeNull();
    expect(conversationIdFromPathname("/properties/abc")).toBeNull();
    expect(conversationIdFromPathname("/settings")).toBeNull();
  });

  test("§3.5.D adversarial-input shape (mirrors isChatPrimary)", () => {
    // Defensive — these inputs would only arise from a Next.js bug or
    // a misuse of the helper outside its pathname contract. The
    // assertions match isChatPrimary's defensive shape so the two
    // helpers don't diverge on unexpected inputs.
    expect(conversationIdFromPathname(null)).toBeNull();
    expect(conversationIdFromPathname(undefined)).toBeNull();
    expect(conversationIdFromPathname("")).toBeNull();
    expect(
      conversationIdFromPathname(123 as unknown as string),
    ).toBeNull();
  });
});
