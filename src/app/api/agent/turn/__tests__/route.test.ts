import { POST } from "../route";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/agent/loop");
// Side-effect import in route.ts registers read_memory; we don't
// need that to actually run for these tests, but the import must
// not throw. Mocking @/lib/agent/tools as a no-op import.
jest.mock("@/lib/agent/tools", () => ({}), { virtual: false });

import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { runAgentTurn } from "@/lib/agent/loop";

const HOST = { id: "00000000-0000-0000-0000-000000000aaa" };

function makeRequest(body: unknown) {
  // Minimal NextRequest stand-in: provide json() + signal.
  return {
    json: jest.fn().mockResolvedValue(body),
    signal: { aborted: false },
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/agent/turn — auth", () => {
  test("returns 401 when no authenticated user", async () => {
    (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: null, error: "Unauthorized" });

    const response = await POST(makeRequest({ conversation_id: null, message: "hi" }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });
});

describe("POST /api/agent/turn — request body validation", () => {
  beforeEach(() => {
    (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: HOST, error: null });
  });

  test("returns 400 for invalid JSON", async () => {
    const req = {
      json: jest.fn().mockRejectedValue(new SyntaxError("bad json")),
      signal: { aborted: false },
    } as unknown as Parameters<typeof POST>[0];

    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  test("returns 400 when conversation_id is not a valid uuid", async () => {
    const response = await POST(
      makeRequest({ conversation_id: "not-a-uuid", message: "hi" }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid request body");
    expect(body.issues).toBeDefined();
  });

  test("returns 400 when message is empty", async () => {
    const response = await POST(makeRequest({ conversation_id: null, message: "" }));
    expect(response.status).toBe(400);
  });

  test("returns 400 when message is too long (>8000)", async () => {
    const longMessage = "a".repeat(8001);
    const response = await POST(
      makeRequest({ conversation_id: null, message: longMessage }),
    );
    expect(response.status).toBe(400);
  });

  test("accepts null conversation_id (new conversation)", async () => {
    (runAgentTurn as jest.Mock).mockReturnValue(
      (async function* () {
        yield { type: "turn_started", conversation_id: "abc" };
        yield { type: "done", turn_id: "t", audit_ids: [] };
      })(),
    );

    const response = await POST(makeRequest({ conversation_id: null, message: "hi" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });
});

describe("POST /api/agent/turn — happy stream", () => {
  beforeEach(() => {
    (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: HOST, error: null });
  });

  test("forwards each runAgentTurn event as an SSE-serialized chunk", async () => {
    (runAgentTurn as jest.Mock).mockReturnValue(
      (async function* () {
        yield { type: "turn_started", conversation_id: "c1" };
        yield { type: "token", delta: "hi" };
        yield { type: "done", turn_id: "t1", audit_ids: [] };
      })(),
    );

    const response = await POST(makeRequest({ conversation_id: null, message: "hi" }));
    expect(response.status).toBe(200);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let body = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
    }

    expect(body).toContain('"type":"turn_started"');
    expect(body).toContain('"type":"token"');
    expect(body).toContain('"type":"done"');
    expect(body.split("\n\n").filter((l) => l.startsWith("data: ")).length).toBe(3);
  });
});

describe("POST /api/agent/turn — error handling", () => {
  beforeEach(() => {
    (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: HOST, error: null });
  });

  test("emits an SSE error event when runAgentTurn throws", async () => {
    (runAgentTurn as jest.Mock).mockReturnValue(
      (async function* () {
        yield { type: "turn_started", conversation_id: "c1" };
        throw new Error("loop blew up");
      })(),
    );

    const response = await POST(makeRequest({ conversation_id: null, message: "hi" }));
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let body = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
    }
    expect(body).toContain('"type":"error"');
    expect(body).toContain('"code":"stream_error"');
    expect(body).toContain("loop blew up");
  });
});
