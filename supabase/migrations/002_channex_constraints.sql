-- Add unique constraints needed for Channex upserts

-- Unique channex_property_id per user (for property upserts)
CREATE UNIQUE INDEX idx_properties_channex_id
  ON properties(channex_property_id)
  WHERE channex_property_id IS NOT NULL;

-- Unique channex_booking_id (for booking upserts)
CREATE UNIQUE INDEX idx_bookings_channex_booking_id
  ON bookings(channex_booking_id)
  WHERE channex_booking_id IS NOT NULL;
