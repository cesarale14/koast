-- Session 6.3 — forward-looking Channex booking pipeline + manual
-- name override for historical reviews.
--
-- Two surfaces:
--   1. bookings: columns Channex's /booking_revisions/feed populates
--      that the iCal path doesn't (real names, OTA confirmation
--      codes, source tag). The reviews->bookings join now keys on
--      ota_reservation_code.
--   2. guest_reviews.guest_name_override: explicit manual fix path
--      for historical reviews whose underlying booking has aged out
--      of Channex's /bookings window. resolver precedence:
--      override > booking > review.guest_name > platform fallback.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ota_reservation_code TEXT,
  ADD COLUMN IF NOT EXISTS guest_first_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_last_name TEXT,
  ADD COLUMN IF NOT EXISTS revision_number INTEGER,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'ical';

-- guest_email, guest_phone, channex_booking_id already exist on bookings.
-- channex_booking_id already has a unique partial index
-- (idx_bookings_channex_booking_id). Don't duplicate.

CREATE INDEX IF NOT EXISTS idx_bookings_ota_reservation_code
  ON bookings(ota_reservation_code)
  WHERE ota_reservation_code IS NOT NULL;

ALTER TABLE guest_reviews
  ADD COLUMN IF NOT EXISTS guest_name_override TEXT;
