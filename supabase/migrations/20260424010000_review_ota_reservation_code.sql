-- Session 6.1c — persist Channex's ota_reservation_id (HM-code for
-- Airbnb, numeric string for BDC) on the review row at sync time.
-- Lets the read path resolve the matching booking later without
-- re-querying Channex. No index yet — review volume is low.

ALTER TABLE guest_reviews
  ADD COLUMN IF NOT EXISTS ota_reservation_code TEXT;
