-- Session 6.1a — persist Channex guest_name on incoming reviews so
-- the /reviews card can render the real name instead of falling back
-- to "Airbnb Guest" when booking_id lookup misses (which is 10/10
-- today on Villa Jamaica because ota_reservation_id → platform_booking_id
-- fails to match — separate follow-up).

ALTER TABLE guest_reviews
  ADD COLUMN IF NOT EXISTS guest_name TEXT;
