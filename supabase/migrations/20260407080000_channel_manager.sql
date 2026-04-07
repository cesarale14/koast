-- Channel Manager Phase 1: property_channels, channex_room_types, channex_rate_plans

CREATE TABLE IF NOT EXISTS property_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  channex_channel_id text NOT NULL,
  channel_code text NOT NULL,
  channel_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_sync_at timestamptz,
  last_error text,
  settings jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, channex_channel_id)
);
CREATE INDEX idx_property_channels_property ON property_channels(property_id);

CREATE TABLE IF NOT EXISTS channex_room_types (
  id text PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  channex_property_id text NOT NULL,
  title text NOT NULL,
  count_of_rooms integer DEFAULT 1,
  occ_adults integer DEFAULT 2,
  occ_children integer DEFAULT 0,
  cached_at timestamptz DEFAULT now()
);
CREATE INDEX idx_channex_room_types_property ON channex_room_types(property_id);

CREATE TABLE IF NOT EXISTS channex_rate_plans (
  id text PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_type_id text NOT NULL,
  title text NOT NULL,
  sell_mode text DEFAULT 'per_room',
  currency text DEFAULT 'USD',
  rate_mode text DEFAULT 'manual',
  cached_at timestamptz DEFAULT now()
);
CREATE INDEX idx_channex_rate_plans_property ON channex_rate_plans(property_id);
