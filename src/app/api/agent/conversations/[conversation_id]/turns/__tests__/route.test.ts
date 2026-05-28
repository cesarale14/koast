/**
 * Route tests for GET /api/agent/conversations/[conversation_id]/turns.
 *
 * M13 Phase 1.B follow-on (deep-link conversation loading bug fix).
 *
 * Covers the contract the ChatURLSync client component depends on:
 *   - 200 + { turns } on legitimate fetch
 *   - 401 on unauthenticated request
 *   - 404 on foreign-owned conversation (ownership check inside
 *     loadTurnsForConversation throws)
 *   - 404 on missing conversation (same throw shape)
 *   - 400 on missing conversation_id in the route param
 *
 * Pattern mirrors the prior /api/agent/artifact and /api/agent/turn
 * route tests: mock supabase server client + loadTurnsForConversation.
 */

import { GET } from "../route";

jest.mock("@/lib/supabase/server");
jest.mock("@/lib/agent/conversation");

import { createClient } from "@/lib/supabase/server";
import { loadTurnsForConversation } from "@/lib/agent/conversation";

const mockedCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;
const mockedLoadTurns = loadTurnsForConversation as jest.MockedFunction<
  typeof loadTurnsForConversation
>;

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const CONVERSATION_ID = "9d39b55d-f741-4945-8385-a0a59139612c";

function mockAuthenticated(): void {
  mockedCreateClient.mockReturnValue({
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: { id: HOST_ID } } }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function mockUnauthenticated(): void {
  mockedCreateClient.mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe("GET /api/agent/conversations/[conversation_id]/turns", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("legitimate fetch returns 200 + turns array", async () => {
    mockAuthenticated();
    const fakeTurns = [
      { id: "t1", turn_index: 0, role: "user", text: "hi" },
      { id: "t2", turn_index: 1, role: "koast", text: "hello" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedLoadTurns.mockResolvedValue(fakeTurns as any);

    const req = new Request(
      `https://app.koasthq.com/api/agent/conversations/${CONVERSATION_ID}/turns`,
    );
    const resp = await GET(req, { params: { conversation_id: CONVERSATION_ID } });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.turns).toEqual(fakeTurns);
    expect(mockedLoadTurns).toHaveBeenCalledWith(CONVERSATION_ID, HOST_ID);
  });

  test("unauthenticated request returns 401 + no load call", async () => {
    mockUnauthenticated();
    const req = new Request(
      `https://app.koasthq.com/api/agent/conversations/${CONVERSATION_ID}/turns`,
    );
    const resp = await GET(req, { params: { conversation_id: CONVERSATION_ID } });
    expect(resp.status).toBe(401);
    expect(mockedLoadTurns).not.toHaveBeenCalled();
  });

  test("foreign-owned conversation returns 404 (load throws)", async () => {
    mockAuthenticated();
    mockedLoadTurns.mockRejectedValue(
      new Error(
        `[conversation] loadTurnsForConversation: conversation ${CONVERSATION_ID} does not belong to host ${HOST_ID}.`,
      ),
    );

    const req = new Request(
      `https://app.koasthq.com/api/agent/conversations/${CONVERSATION_ID}/turns`,
    );
    const resp = await GET(req, { params: { conversation_id: CONVERSATION_ID } });
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error).toMatch(/not found or not accessible/i);
  });

  test("missing conversation returns 404 (load throws)", async () => {
    mockAuthenticated();
    mockedLoadTurns.mockRejectedValue(
      new Error(
        `[conversation] loadTurnsForConversation: cannot fetch ${CONVERSATION_ID}: no row`,
      ),
    );

    const req = new Request(
      `https://app.koasthq.com/api/agent/conversations/${CONVERSATION_ID}/turns`,
    );
    const resp = await GET(req, { params: { conversation_id: CONVERSATION_ID } });
    expect(resp.status).toBe(404);
  });

  test("missing conversation_id in route param returns 400", async () => {
    mockAuthenticated();
    const req = new Request(
      "https://app.koasthq.com/api/agent/conversations//turns",
    );
    const resp = await GET(req, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params: { conversation_id: "" as any },
    });
    expect(resp.status).toBe(400);
    expect(mockedLoadTurns).not.toHaveBeenCalled();
  });
});
