-- P6.4 — eyes: channel-disconnect host alerts + internal API error capture.
-- Additive (one new type value + one new table). No data migration.

-- ── (1) host_notifications: add 'channel_disconnect' to the type vocabulary ──
-- A channel going dark (Airbnb/BDC token failure, stale sync) is host-facing —
-- the host needs to know bookings may stop flowing. Mirrored by HostNotificationType.
ALTER TABLE public.host_notifications DROP CONSTRAINT IF EXISTS host_notifications_type_check;
ALTER TABLE public.host_notifications ADD CONSTRAINT host_notifications_type_check
  CHECK (type = ANY (ARRAY[
    'cleaning_completed',
    'booking_new',
    'booking_cancelled',
    'proposal_created',
    'push_delivery_failure',
    'channel_disconnect'
  ]::text[]));

-- ── (2) api_errors — internal, operator-facing error capture ────────────────
-- Chosen over Sentry (no dep, no DSN). captureApiError() writes here; a burst of
-- same-route failures is logged loudly for the operator. NOT host-facing (RLS on,
-- no policies → service-role only).
CREATE TABLE IF NOT EXISTS public.api_errors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route      text        NOT NULL,
  method     text,
  status     integer,
  message    text        NOT NULL,
  context    jsonb       DEFAULT '{}'::jsonb,
  host_id    uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_errors ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_api_errors_route_created ON public.api_errors (route, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_errors_created       ON public.api_errors (created_at DESC);
