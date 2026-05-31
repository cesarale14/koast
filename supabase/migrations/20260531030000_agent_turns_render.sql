-- Generative-UI render system (Phase A) — turn-level render payload.
--
-- A turn already persists three independent typed payloads that rehydrate into
-- purpose-built chat components: content_text (prose), tool_calls (JSONB), and
-- refusal (JSONB). This adds the FOURTH, parallel, turn-level payload: `render`
-- — a typed, host-facing, READ-ONLY structured render (v1: the agenda). It is
-- NOT an agent_artifacts row (those are gated, actionable, host-approved
-- proposals with a lifecycle); a render is non-actionable and exactly one per
-- turn, so it lives on the turn like `refusal`.
--
-- HAND-WRITTEN ADD COLUMN (never drizzle-kit generate): generating from a
-- schema.ts that is missing the live `active_property_id` column would propose
-- DROPPING it. An explicit ADD COLUMN can only add. The active_property_id
-- drift is reconciled separately, on its own track.
--
-- Nullable (most turns have no render). agent_turns is already RLS-enabled, so
-- no RLS statement is needed. Checkpoint discipline (D1): staging first
-- (gated + verified) -> prod applied by hand before the reader code deploys.

ALTER TABLE agent_turns ADD COLUMN IF NOT EXISTS render jsonb;

COMMENT ON COLUMN agent_turns.render IS
  'Generative-UI render payload (Phase A). Typed, host-facing, read-only structured render for the chat surface (v1: agenda). One per turn; mirrors the refusal column pattern. NULL = prose-only turn.';
