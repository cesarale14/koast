-- MSG-S1 Phase A — messaging slice 1 schema.
--
-- Adds message_threads (new), extends messages (existing 5 hand-seeded
-- rows are deleted in this migration — they predate the real model and
-- have no thread_id to migrate to per docs/MESSAGING_DESIGN.md §6.7),
-- adds properties.messages_last_synced_at for the worker freshness
-- stamp.
--
-- Schema follows docs/MESSAGING_DESIGN.md §3 verbatim. Channel-
-- asymmetric booking link: BDC threads carry channex_booking_id from
-- relationships.booking; AirBNB threads derive via
-- ota_message_thread_id → bookings.platform_booking_id (RDX-3 join key).
--
-- Three forward-compat outbound columns are added now so slice 2
-- (outbound send) doesn't need a follow-up migration. They stay NULL
-- until a real send fires.

-- ---------------- 1. message_threads (new) ----------------

CREATE TABLE IF NOT EXISTS message_threads (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id                 uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  booking_id                  uuid REFERENCES bookings(id) ON DELETE SET NULL,
  channex_thread_id           text NOT NULL,
  channex_channel_id          text,                       -- relationships.channel.data.id
  channex_booking_id          text,                       -- BDC threads carry it; AirBNB do not
  ota_message_thread_id       text,                       -- OTA's native id
  channel_code                text NOT NULL,              -- 'abb' | 'bdc' (sync-stamped)
  provider_raw                text NOT NULL,              -- 'AirBNB' | 'BookingCom' (raw from Channex)
  title                       text,
  last_message_preview        text,
  last_message_received_at    timestamptz,
  message_count               integer NOT NULL DEFAULT 0,
  unread_count                integer NOT NULL DEFAULT 0,
  is_closed                   boolean NOT NULL DEFAULT false,
  status                      text NOT NULL DEFAULT 'active',  -- 'active' | 'archived' | 'no_reply_needed'
  thread_kind                 text NOT NULL DEFAULT 'message', -- 'message' | 'inquiry' | 'reservation_request'
  meta                        jsonb,
  channex_inserted_at         timestamptz,
  channex_updated_at          timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_threads_channex_id
  ON message_threads(channex_thread_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_property_last
  ON message_threads(property_id, last_message_received_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_threads_booking
  ON message_threads(booking_id) WHERE booking_id IS NOT NULL;

-- ---------------- 2. messages (extend existing) ----------------

-- Cleanup hand-seeded rows from before this design landed. Per
-- MESSAGING_AUDIT §6.7 + MESSAGING_DESIGN §6.7. They're test data
-- with booking_id=NULL across April 8-9 2026; no thread_id to migrate.
-- Done before column adds so the cleanup is shape-independent.
DELETE FROM messages WHERE created_at < '2026-04-10';

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS thread_id            uuid REFERENCES message_threads(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS channex_message_id   text,
  ADD COLUMN IF NOT EXISTS ota_message_id       text,
  ADD COLUMN IF NOT EXISTS sender               text,                       -- 'guest' | 'property' | 'system'
  ADD COLUMN IF NOT EXISTS attachments          jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS channex_meta         jsonb,
  ADD COLUMN IF NOT EXISTS read_at              timestamptz,                -- NULL = unread
  ADD COLUMN IF NOT EXISTS channex_inserted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS channex_updated_at   timestamptz,
  -- Slice 2 — outbound send (three-stage write per MESSAGING_DESIGN §6.9).
  -- Added now to avoid a slice-2 follow-up migration. NULL until used.
  ADD COLUMN IF NOT EXISTS host_send_submitted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS host_send_channex_acked_at  timestamptz,
  ADD COLUMN IF NOT EXISTS host_send_ota_confirmed_at  timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_channex_id
  ON messages(channex_message_id) WHERE channex_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_thread_inserted
  ON messages(thread_id, channex_inserted_at);

-- ---------------- 3. properties.messages_last_synced_at ----------------

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS messages_last_synced_at TIMESTAMPTZ;
