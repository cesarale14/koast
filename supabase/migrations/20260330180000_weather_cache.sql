-- Weather forecast cache for pricing engine
CREATE TABLE IF NOT EXISTS weather_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  latitude decimal(10,7) NOT NULL,
  longitude decimal(10,7) NOT NULL,
  forecast_date date NOT NULL,
  temp_high decimal(5,1),
  temp_low decimal(5,1),
  precipitation_pct int,
  conditions text,
  raw_data jsonb,
  fetched_at timestamptz DEFAULT now(),
  UNIQUE(latitude, longitude, forecast_date)
);

CREATE INDEX idx_weather_cache_coords_date ON weather_cache(latitude, longitude, forecast_date);
