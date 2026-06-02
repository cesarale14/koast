/**
 * Gate for the reconcile-by-id WIRING seam (the one the create-append item-5
 * e2e does NOT cover — it checks persistence post-reload, where the optimistic
 * state has reset). The optimistic rail entry's id MUST be the server
 * conversation id so mergeConversationLists dedups it against the server row by
 * id. A temp/client id (the ChatClient.tsx:818 break that sailed through both
 * the e2e and the merge-function unit tests) turns the first assertion RED.
 */
import { buildOptimisticConvEntry } from "@/components/chat/optimisticConvEntry";

describe("buildOptimisticConvEntry — reconcile-by-id wiring", () => {
  it("uses the SERVER conversation id verbatim (never a temp/client id)", () => {
    const entry = buildOptimisticConvEntry("conv-server-123", "what's my occupancy?");
    // The load-bearing assertion: a `temp-${id}` regression here breaks the
    // merge dedup (mismatched id → duplicate rail entry).
    expect(entry.id).toBe("conv-server-123");
  });

  it("carries the first-message preview and an empty property placeholder", () => {
    const entry = buildOptimisticConvEntry("c1", "draft a check-in reply");
    expect(entry.preview).toBe("draft a check-in reply");
    expect(entry.propertyName).toBe("");
    expect(typeof entry.last_turn_at).toBe("string");
  });
});
