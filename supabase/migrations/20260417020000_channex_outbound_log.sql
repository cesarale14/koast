-- Outbound Channex API call log. Every write (POST/PATCH/PUT/DELETE)
-- the Next.js layer makes to Channex should land a row here so that
-- any future clobber incident (see docs/postmortems/INCIDENT_POSTMORTEM_BDC_CLOBBER.md)
-- can be reconstructed exactly — which property, which rate plan,
-- which date range, which entries, what Channex answered.
--
-- The existing channex_webhook_log table captures INBOUND events only
-- (Channex → Koast). This is the OUTBOUND counterpart (Koast → Channex).
--
-- Writer: src/lib/channex/client.ts request() method logs every
-- non-GET call via the shared logOutbound helper. Read calls (GET) are
-- not logged here to keep the table bounded — they don't change state.

CREATE TABLE IF NOT EXISTS channex_outbound_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         uuid REFERENCES properties(id) ON DELETE SET NULL,
  channex_property_id text,
  rate_plan_id        text,
  endpoint            text NOT NULL,
  method              text NOT NULL,
  date_from           date,
  date_to             date,
  entries_count       integer,
  payload_hash        text,
  payload_sample      jsonb,
  response_status     integer,
  response_body       jsonb,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channex_outbound_property_time
  ON channex_outbound_log(property_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_channex_outbound_endpoint
  ON channex_outbound_log(endpoint, created_at DESC);

-- Deploy marker so the start of log coverage is unambiguous.
INSERT INTO channex_outbound_log (endpoint, method, entries_count, response_body)
VALUES (
  'deploy_marker',
  'NOOP',
  0,
  '{"note": "outbound logging begins here"}'::jsonb
);
