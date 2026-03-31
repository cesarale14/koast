-- Add cover_photo_url to properties for OTA-sourced listing photos
ALTER TABLE properties ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;

-- Add platform_listing_id to ical_feeds for extracted listing IDs
ALTER TABLE ical_feeds ADD COLUMN IF NOT EXISTS platform_listing_id TEXT;
