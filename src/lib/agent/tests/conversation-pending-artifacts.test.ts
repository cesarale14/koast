/**
 * loadTurnsForConversation pending-artifacts surface — M7 D45.
 *
 * Verifies that the artifact state filter widening (emitted | edited |
 * confirmed | superseded) and the kind-agnostic mapping surface both
 * memory_artifact and guest_message_proposal artifacts on conversation
 * reload, including the §11 amendment failed-state derivation
 * (substrate state stays 'emitted', commit_metadata.last_error carries
 * the signal).
 */

import { loadTurnsForConversation } from "../conversation";

jest.mock("@/lib/supabase/service");
import { createServiceClient } from "@/lib/supabase/service";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const CONV_ID = "11111111-1111-4111-8111-111111111111";
const TURN_ID = "22222222-2222-4222-8222-222222222222";

interface ArtifactRow {
  id: string;
  turn_id: string;
  audit_log_id: string;
  kind: string;
  payload: Record<string, unknown>;
  supersedes: string | null;
  created_at: string;
  state: string;
  commit_metadata: Record<string, unknown> | null;
}

interface MockOpts {
  artifacts: ArtifactRow[];
  hostMatches?: boolean;
  /** M7 channel join — booking_id → channel_code rows. Default empty. */
  threadChannels?: Array<{ booking_id: string; channel_code: string | null }>;
}

function mockSupabase(opts: MockOpts): {
  artifactStateFilter: jest.Mock;
} {
  // Ownership check
  const ownerSingle = jest.fn().mockResolvedValue({
    data: { id: CONV_ID, host_id: opts.hostMatches === false ? "other-host" : HOST_ID },
    error: null,
  });
  const ownerEq = jest.fn(() => ({ single: ownerSingle }));
  const ownerSelect = jest.fn(() => ({ eq: ownerEq }));

  // Turns query (return one assistant stub turn so the parallel query
  // shape is right; assistants without content_text are filtered out
  // by the stub filter, so we use a shape that survives).
  const turnsOrder = jest.fn().mockResolvedValue({
    data: [
      {
        id: TURN_ID,
        turn_index: 0,
        role: "assistant",
        content_text: "Drafted a reply.",
        tool_calls: [],
        refusal: null,
        created_at: "2026-05-04T00:00:00Z",
      },
    ],
    error: null,
  });
  const turnsEq = jest.fn(() => ({ order: turnsOrder }));
  const turnsSelect = jest.fn(() => ({ eq: turnsEq }));

  // Artifacts query — capture .in("state", […]) call so the test can
  // assert the union widening.
  const artifactStateFilter = jest.fn();
  const artifactsOrder = jest.fn().mockResolvedValue({
    data: opts.artifacts,
    error: null,
  });
  const artifactsIn = jest.fn((column: string, values: string[]) => {
    artifactStateFilter(column, values);
    return { order: artifactsOrder };
  });
  const artifactsEq = jest.fn(() => ({ in: artifactsIn }));
  const artifactsSelect = jest.fn(() => ({ eq: artifactsEq }));

  // M7 channel-join — second-pass query against message_threads keyed
  // by booking_id IN (...). Returns channel_code rows for the channel
  // resolution path in loadTurnsForConversation.
  const threadChannelsIn = jest.fn().mockResolvedValue({
    data: opts.threadChannels ?? [],
    error: null,
  });
  const threadChannelsSelect = jest.fn(() => ({ in: threadChannelsIn }));

  const fromMock = jest.fn((table: string) => {
    if (table === "agent_conversations") return { select: ownerSelect };
    if (table === "agent_turns") return { select: turnsSelect };
    if (table === "agent_artifacts") return { select: artifactsSelect };
    if (table === "message_threads") return { select: threadChannelsSelect };
    throw new Error(`unexpected from(${table})`);
  });

  (createServiceClient as jest.Mock).mockReturnValue({ from: fromMock });
  return { artifactStateFilter };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("loadTurnsForConversation — M7 D45 state union widening", () => {
  test("query filter includes 'edited' alongside emitted/confirmed/superseded", async () => {
    const { artifactStateFilter } = mockSupabase({ artifacts: [] });
    await loadTurnsForConversation(CONV_ID, HOST_ID);
    expect(artifactStateFilter).toHaveBeenCalledWith(
      "state",
      expect.arrayContaining(["emitted", "edited", "confirmed", "superseded"]),
    );
  });
});

describe("loadTurnsForConversation — guest_message_proposal surfacing", () => {
  test("state='edited' guest message surfaces with edited_text in payload + derived_channel from message_threads join", async () => {
    mockSupabase({
      artifacts: [
        {
          id: "art-1",
          turn_id: TURN_ID,
          audit_log_id: "audit-1",
          kind: "guest_message_proposal",
          payload: {
            booking_id: "bk-1",
            message_text: "agent draft",
            edited_text: "host edit",
          },
          supersedes: null,
          created_at: "2026-05-04T00:00:00Z",
          state: "edited",
          commit_metadata: null,
        },
      ],
      threadChannels: [{ booking_id: "bk-1", channel_code: "abb" }],
    });

    const turns = await loadTurnsForConversation(CONV_ID, HOST_ID);
    const artifacts = turns[0].pendingArtifacts;
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].kind).toBe("guest_message_proposal");
    expect(artifacts[0].state).toBe("edited");
    expect(artifacts[0].payload.edited_text).toBe("host edit");
    expect(artifacts[0].payload.message_text).toBe("agent draft");
    // M7 channel-display fix: derived_channel resolved via the
    // message_threads join. abb → airbnb.
    expect(artifacts[0].derived_channel).toBe("airbnb");
  });

  test("state='emitted' guest message with commit_metadata.last_error surfaces with metadata intact (chat shell derives 'failed')", async () => {
    mockSupabase({
      artifacts: [
        {
          id: "art-2",
          turn_id: TURN_ID,
          audit_log_id: "audit-2",
          kind: "guest_message_proposal",
          payload: { booking_id: "bk-2", message_text: "draft" },
          supersedes: null,
          created_at: "2026-05-04T00:00:00Z",
          state: "emitted",
          commit_metadata: {
            last_error: {
              message: "thread closed",
              channex_status: 422,
              attempted_at: "2026-05-04T00:01:00Z",
            },
          },
        },
      ],
    });

    const turns = await loadTurnsForConversation(CONV_ID, HOST_ID);
    const artifact = turns[0].pendingArtifacts[0];
    expect(artifact.state).toBe("emitted"); // §11 amendment: NOT 'failed'
    const lastError = (artifact.commit_metadata as { last_error?: { message: string; channex_status: number } } | null)
      ?.last_error;
    expect(lastError?.message).toBe("thread closed");
    expect(lastError?.channex_status).toBe(422);
  });

  test("state='confirmed' guest message surfaces with channex_message_id + derived_channel from commit_metadata.channel (post-handler write)", async () => {
    mockSupabase({
      artifacts: [
        {
          id: "art-3",
          turn_id: TURN_ID,
          audit_log_id: "audit-3",
          kind: "guest_message_proposal",
          payload: { booking_id: "bk-3", message_text: "approved draft" },
          supersedes: null,
          created_at: "2026-05-04T00:00:00Z",
          state: "confirmed",
          commit_metadata: {
            channex_message_id: "cx-msg-99",
            message_id: "msg-row-1",
            channel: "airbnb",
          },
        },
      ],
      // Even with a join row available, commit_metadata.channel takes
      // precedence (post-handler write is canonical).
      threadChannels: [{ booking_id: "bk-3", channel_code: "bdc" }],
    });

    const turns = await loadTurnsForConversation(CONV_ID, HOST_ID);
    const artifact = turns[0].pendingArtifacts[0];
    expect(artifact.state).toBe("confirmed");
    const meta = artifact.commit_metadata as { channex_message_id: string };
    expect(meta.channex_message_id).toBe("cx-msg-99");
    expect(artifact.derived_channel).toBe("airbnb");
  });

  test("derived_channel falls back to message_threads join when commit_metadata.channel is absent (legacy artifacts pre-handler-channel-write)", async () => {
    mockSupabase({
      artifacts: [
        {
          id: "art-4",
          turn_id: TURN_ID,
          audit_log_id: "audit-4",
          kind: "guest_message_proposal",
          payload: { booking_id: "bk-4", message_text: "draft" },
          supersedes: null,
          created_at: "2026-05-04T00:00:00Z",
          state: "confirmed",
          commit_metadata: {
            channex_message_id: "cx-msg-legacy",
            message_id: "msg-row-legacy",
            // No `channel` key — pre-fix artifact (Phase C smoke
            // surfaced this row in production at 2026-05-05 05:15)
          },
        },
      ],
      threadChannels: [{ booking_id: "bk-4", channel_code: "abb" }],
    });

    const turns = await loadTurnsForConversation(CONV_ID, HOST_ID);
    const artifact = turns[0].pendingArtifacts[0];
    expect(artifact.derived_channel).toBe("airbnb");
  });

  test("derived_channel maps bdc → booking_com via the join", async () => {
    mockSupabase({
      artifacts: [
        {
          id: "art-5",
          turn_id: TURN_ID,
          audit_log_id: "audit-5",
          kind: "guest_message_proposal",
          payload: { booking_id: "bk-5", message_text: "draft" },
          supersedes: null,
          created_at: "2026-05-04T00:00:00Z",
          state: "emitted",
          commit_metadata: null,
        },
      ],
      threadChannels: [{ booking_id: "bk-5", channel_code: "bdc" }],
    });

    const artifact = (await loadTurnsForConversation(CONV_ID, HOST_ID))[0].pendingArtifacts[0];
    expect(artifact.derived_channel).toBe("booking_com");
  });

  test("derived_channel undefined when no message_threads row matches (rare — fresh booking)", async () => {
    mockSupabase({
      artifacts: [
        {
          id: "art-6",
          turn_id: TURN_ID,
          audit_log_id: "audit-6",
          kind: "guest_message_proposal",
          payload: { booking_id: "bk-no-thread", message_text: "draft" },
          supersedes: null,
          created_at: "2026-05-04T00:00:00Z",
          state: "emitted",
          commit_metadata: null,
        },
      ],
      threadChannels: [], // no rows for bk-no-thread
    });

    const artifact = (await loadTurnsForConversation(CONV_ID, HOST_ID))[0].pendingArtifacts[0];
    expect(artifact.derived_channel).toBeUndefined();
  });
});

describe("loadTurnsForConversation — M6 memory_artifact regression", () => {
  test("state='emitted' memory artifact still surfaces correctly post-M7 widening", async () => {
    mockSupabase({
      artifacts: [
        {
          id: "art-mem-1",
          turn_id: TURN_ID,
          audit_log_id: "audit-mem-1",
          kind: "property_knowledge_confirmation",
          payload: {
            property_id: "11111111-1111-4111-8111-111111111111",
            sub_entity_type: "wifi",
            attribute: "password",
            fact_value: "Sandcastle!42",
            source: "host_taught",
          },
          supersedes: null,
          created_at: "2026-05-04T00:00:00Z",
          state: "emitted",
          commit_metadata: null,
        },
      ],
    });

    const turns = await loadTurnsForConversation(CONV_ID, HOST_ID);
    const artifact = turns[0].pendingArtifacts[0];
    expect(artifact.kind).toBe("property_knowledge_confirmation");
    expect(artifact.state).toBe("emitted");
    expect(artifact.payload.attribute).toBe("password");
  });

  test("multiple artifacts of different kinds surface together on the same turn", async () => {
    mockSupabase({
      artifacts: [
        {
          id: "art-mem",
          turn_id: TURN_ID,
          audit_log_id: "audit-mem",
          kind: "property_knowledge_confirmation",
          payload: { property_id: "p", sub_entity_type: "wifi", attribute: "a", fact_value: "v", source: "host_taught" },
          supersedes: null,
          created_at: "2026-05-04T00:00:00Z",
          state: "emitted",
          commit_metadata: null,
        },
        {
          id: "art-gm",
          turn_id: TURN_ID,
          audit_log_id: "audit-gm",
          kind: "guest_message_proposal",
          payload: { booking_id: "b", message_text: "m" },
          supersedes: null,
          created_at: "2026-05-04T00:00:01Z",
          state: "emitted",
          commit_metadata: null,
        },
      ],
    });
    const turns = await loadTurnsForConversation(CONV_ID, HOST_ID);
    const kinds = turns[0].pendingArtifacts.map((a) => a.kind).sort();
    expect(kinds).toEqual(["guest_message_proposal", "property_knowledge_confirmation"]);
  });
});
