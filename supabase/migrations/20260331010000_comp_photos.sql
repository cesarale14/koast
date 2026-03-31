-- Add photo_url and coordinates to market_comps for comp listing images
ALTER TABLE market_comps ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE market_comps ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7);
ALTER TABLE market_comps ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7);
