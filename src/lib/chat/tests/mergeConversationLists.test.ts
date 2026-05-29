import { mergeConversationLists } from "../mergeConversationLists";

type Row = { id: string; last_turn_at: string; preview?: string };

describe("mergeConversationLists — M13 Phase 1.B list-on-creation", () => {
  test("empty optimistic returns server sorted desc", () => {
    const server: Row[] = [
      { id: "a", last_turn_at: "2026-05-01T00:00:00Z" },
      { id: "b", last_turn_at: "2026-05-03T00:00:00Z" },
    ];
    const out = mergeConversationLists(server, []);
    expect(out.map((c) => c.id)).toEqual(["b", "a"]);
  });

  test("optimistic-only (server not yet fetched) appears", () => {
    const optimistic: Row[] = [
      { id: "new", last_turn_at: "2026-05-29T00:00:00Z", preview: "New conversation" },
    ];
    const out = mergeConversationLists([], optimistic);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("new");
  });

  test("optimistic prepends ahead of older server entries (most-recent-first)", () => {
    const server: Row[] = [{ id: "old", last_turn_at: "2026-05-01T00:00:00Z" }];
    const optimistic: Row[] = [
      { id: "new", last_turn_at: "2026-05-29T12:00:00Z", preview: "hi koast" },
    ];
    const out = mergeConversationLists(server, optimistic);
    expect(out.map((c) => c.id)).toEqual(["new", "old"]);
  });

  test("reconciliation: server row WINS on id collision (no duplicate)", () => {
    // The optimistic entry had a placeholder preview; the server row has
    // the real title. After the server set arrives, the merged list must
    // contain ONE entry (server's), not two.
    const optimistic: Row[] = [
      { id: "x", last_turn_at: "2026-05-29T12:00:00Z", preview: "New conversation" },
    ];
    const server: Row[] = [
      { id: "x", last_turn_at: "2026-05-29T12:00:05Z", preview: "Why is next weekend $184?" },
    ];
    const out = mergeConversationLists(server, optimistic);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("x");
    expect(out[0].preview).toBe("Why is next weekend $184?");
    expect(out[0].last_turn_at).toBe("2026-05-29T12:00:05Z");
  });

  test("multiple optimistic + multiple server, deduped + sorted", () => {
    const server: Row[] = [
      { id: "s1", last_turn_at: "2026-05-10T00:00:00Z" },
      { id: "shared", last_turn_at: "2026-05-20T00:00:00Z", preview: "server" },
    ];
    const optimistic: Row[] = [
      { id: "o1", last_turn_at: "2026-05-29T00:00:00Z" },
      { id: "shared", last_turn_at: "2026-05-19T00:00:00Z", preview: "optimistic" },
    ];
    const out = mergeConversationLists(server, optimistic);
    // ids: o1 (29th), shared (server, 20th), s1 (10th)
    expect(out.map((c) => c.id)).toEqual(["o1", "shared", "s1"]);
    // shared resolved to the server row
    expect(out.find((c) => c.id === "shared")?.preview).toBe("server");
  });

  test("does not mutate inputs", () => {
    const server: Row[] = [{ id: "a", last_turn_at: "2026-05-01T00:00:00Z" }];
    const optimistic: Row[] = [{ id: "b", last_turn_at: "2026-05-02T00:00:00Z" }];
    const serverCopy = [...server];
    const optimisticCopy = [...optimistic];
    mergeConversationLists(server, optimistic);
    expect(server).toEqual(serverCopy);
    expect(optimistic).toEqual(optimisticCopy);
  });
});
