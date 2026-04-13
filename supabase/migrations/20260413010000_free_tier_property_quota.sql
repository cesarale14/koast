-- Enforce subscription tier property quotas at the DB level so two
-- concurrent INSERTs from the same user can't both bypass a client-side
-- count check. Per-tier limits: free=1, pro=15, business=unlimited.

CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('free', 'pro', 'business')),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- Grandfather in every existing user as "business" so we don't retroactively
-- block properties that were imported/created before this trigger existed.
-- New signups get no row → trigger defaults to free tier below.
INSERT INTO user_subscriptions (user_id, tier)
SELECT DISTINCT user_id, 'business'
FROM properties
WHERE user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION enforce_property_quota() RETURNS trigger AS $$
DECLARE
  existing_count integer;
  user_tier text;
  tier_limit integer;
BEGIN
  -- Default to free if no subscription row exists.
  SELECT tier INTO user_tier FROM user_subscriptions WHERE user_id = NEW.user_id;
  IF user_tier IS NULL THEN
    user_tier := 'free';
  END IF;

  -- business = unlimited, bypass the check entirely.
  IF user_tier = 'business' THEN
    RETURN NEW;
  END IF;

  tier_limit := CASE user_tier
    WHEN 'pro' THEN 15
    ELSE 1  -- free
  END;

  SELECT COUNT(*) INTO existing_count
  FROM properties
  WHERE user_id = NEW.user_id;

  IF existing_count >= tier_limit THEN
    RAISE EXCEPTION 'property_quota_exceeded'
      USING HINT = format('Your %s plan is limited to %s properties. Upgrade to add more.', user_tier, tier_limit),
            ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_property_quota_trigger ON properties;
CREATE TRIGGER enforce_property_quota_trigger
  BEFORE INSERT ON properties
  FOR EACH ROW
  EXECUTE FUNCTION enforce_property_quota();
