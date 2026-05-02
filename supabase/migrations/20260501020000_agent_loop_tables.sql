-- Agent loop v1 — Milestone 1, migration 2 of 4.
--
-- The agent loop's conversational state. Three tables, designed as a
-- coherent unit because they reference each other:
--
-- 1. agent_conversations — top-level conversation between host and
--    Koast. One per chat thread.
-- 2. agent_turns — individual turns within a conversation. role='user'
--    for host messages, role='assistant' for agent responses (which may
--    contain tool calls and artifact emissions).
-- 3. agent_artifacts — interactive artifacts emitted by the agent
--    inline in a turn (e.g., property_knowledge_confirmation block).
--    State machine: emitted → confirmed | edited | dismissed.
--
-- Conventions: snake_case, RLS via host_id = auth.uid() (agent state is
-- always host-scoped), text + CHECK for enums, JSONB for flexible
-- payloads. ON DELETE CASCADE downwards from conversation → turn →
-- artifact since agent state lifecycle is owned by the conversation.

-- =============================================================================
-- agent_conversations
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- When the host first engaged this conversation. Distinct from
  -- created_at to allow future "draft" conversations that get started
  -- before being engaged.
  started_at   timestamptz NOT NULL DEFAULT now(),
  -- Updated by the agent loop on every turn. Drives the recent-list UI
  -- and the "active conversations" filter.
  last_turn_at timestamptz NOT NULL DEFAULT now(),
  -- Lifecycle. 'active' = host can resume; 'closed' = explicitly closed
  -- by host or by inactivity timeout (Phase 2+); 'error' = unrecoverable
  -- mid-stream failure that the host hasn't retried.
  status       text NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'closed', 'error'
  )),
  -- Optional human-readable title. NULL until the agent auto-titles
  -- (Phase 2+) or the host edits.
  title        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Recent-conversations list UI: scoped by host, ordered by most recent
-- activity.
CREATE INDEX IF NOT EXISTS idx_agent_conversations_host_recent
  ON agent_conversations(host_id, last_turn_at DESC);

-- Active-conversation lookup.
CREATE INDEX IF NOT EXISTS idx_agent_conversations_host_status
  ON agent_conversations(host_id, status) WHERE status = 'active';

ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own conversations" ON agent_conversations FOR ALL
  USING (host_id = auth.uid());

CREATE OR REPLACE FUNCTION set_agent_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_conversations_updated_at
  BEFORE UPDATE ON agent_conversations
  FOR EACH ROW EXECUTE FUNCTION set_agent_conversations_updated_at();


-- =============================================================================
-- agent_turns
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_turns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES agent_conversations(id) ON DELETE CASCADE,
  -- Sequence number within the conversation, starting at 0. Used for
  -- stable ordering and pagination. The agent loop assigns this
  -- monotonically; concurrent writes within a single conversation are
  -- serialized at the application layer (one turn at a time per chat).
  turn_index      integer NOT NULL,
  -- 'user' = host typed a message. 'assistant' = the agent's response
  -- to that message. tool_use / tool_result blocks are flattened into
  -- the assistant turn's tool_calls JSONB rather than being separate
  -- turn rows — this matches how Anthropic's content-block model
  -- already groups them within a single message.
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),

  -- Plain-text content of the turn. For 'user' turns, the typed
  -- message. For 'assistant' turns, the streamed response text
  -- (post-stream concatenation; tool_use blocks are extracted into
  -- tool_calls). NULL for assistant turns that were pure refusals
  -- with no surface text.
  content_text    text,

  -- Array of tool call records when the assistant turn invoked tools.
  -- Shape per call:
  --   {
  --     "tool_use_id": "...",
  --     "name": "read_memory",
  --     "input": { ... },           -- the validated input
  --     "result": { ... },          -- the validated output, or
  --     "error": "...",             -- when is_error=true
  --     "started_at": "ISO ts",
  --     "completed_at": "ISO ts"
  --   }
  -- NULL for user turns and for assistant turns that didn't call tools.
  tool_calls      jsonb,

  -- Array of artifact emission references — one entry per artifact
  -- emitted from this assistant turn. Each entry: { "artifact_id": "..." }
  -- The artifact's full payload + state lives in agent_artifacts; this
  -- column is a quick lookup index.
  artifacts       jsonb,

  -- Refusal-fallback metadata when the assistant turn produced a
  -- structured refusal instead of (or alongside) text. Shape:
  --   { "reason": "...", "missing_data": "...", "next_step": "..." }
  refusal         jsonb,

  -- Cost / debug metadata.
  model_id            text,
  input_tokens        integer,
  output_tokens       integer,
  cache_read_tokens   integer,

  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Within a conversation, turn_index is unique. Together with the
  -- index, gives O(log n) "fetch turn N" and ordered iteration.
  UNIQUE (conversation_id, turn_index)
);

CREATE INDEX IF NOT EXISTS idx_agent_turns_conversation
  ON agent_turns(conversation_id, turn_index);

ALTER TABLE agent_turns ENABLE ROW LEVEL SECURITY;

-- Turns inherit access from the parent conversation.
CREATE POLICY "Users access turns of own conversations" ON agent_turns FOR ALL
  USING (conversation_id IN (
    SELECT id FROM agent_conversations WHERE host_id = auth.uid()
  ));


-- =============================================================================
-- agent_artifacts
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_artifacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES agent_conversations(id) ON DELETE CASCADE,
  turn_id         uuid NOT NULL
    REFERENCES agent_turns(id) ON DELETE CASCADE,
  -- Matches the artifact registry's typed kind. v1's only kind is
  -- 'property_knowledge_confirmation'. New kinds added in later slices
  -- don't require a migration; the column is text + registry validation
  -- on read/write.
  kind            text NOT NULL,
  -- The structured payload the agent emitted. Shape varies by kind;
  -- validated by the registry's Zod schema at emit and read time.
  payload         jsonb NOT NULL,
  -- State machine:
  --   'emitted'   = just produced by the agent, awaiting host action
  --   'confirmed' = host clicked save with no edits
  --   'edited'    = host modified the payload then saved
  --   'dismissed' = host rejected
  state           text NOT NULL DEFAULT 'emitted' CHECK (state IN (
    'emitted', 'confirmed', 'edited', 'dismissed'
  )),
  -- When state transitioned out of 'emitted'. NULL while still 'emitted'.
  committed_at    timestamptz,
  -- Per-kind structured metadata about the commit. For
  -- property_knowledge_confirmation:
  --   { "memory_fact_id": "...", "edited_payload": { ... } }
  -- For dismissed:
  --   { "reason": "..." }
  commit_metadata jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Conversation-level artifact list (recent-first).
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_conversation
  ON agent_artifacts(conversation_id, created_at DESC);

-- Per-turn lookup (artifact replay when reloading conversation).
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_turn
  ON agent_artifacts(turn_id);

-- Pending-action tracking: artifacts still awaiting host response.
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_pending
  ON agent_artifacts(conversation_id, created_at DESC) WHERE state = 'emitted';

ALTER TABLE agent_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access artifacts of own conversations" ON agent_artifacts FOR ALL
  USING (conversation_id IN (
    SELECT id FROM agent_conversations WHERE host_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION set_agent_artifacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_artifacts_updated_at
  BEFORE UPDATE ON agent_artifacts
  FOR EACH ROW EXECUTE FUNCTION set_agent_artifacts_updated_at();
