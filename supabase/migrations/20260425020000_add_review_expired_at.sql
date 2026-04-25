-- Session 6.5 — store Channex's expired_at on guest_reviews so the UI
-- can gate "Review this guest" on the actual two-sided window state.
--
-- Channex /reviews exposes expired_at (ISO timestamp; the moment the
-- 14-day Airbnb submission window closes) and is_expired (boolean,
-- already-derived). We store the timestamp; consumers derive
-- is_expired = expired_at IS NOT NULL AND expired_at <= now() at read
-- time, which keeps the source of truth on Channex's side and avoids
-- stale boolean drift between sync runs.
--
-- Backfill happens on the next /api/reviews/sync run; this migration
-- only adds the column.

ALTER TABLE guest_reviews
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
