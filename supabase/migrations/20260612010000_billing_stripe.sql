-- Koast v1 P5 — Stripe billing (TEST MODE). Additive: extend user_subscriptions
-- with the Stripe sync columns + a comped grandfather flag, and add a webhook
-- idempotency ledger. No behavior change until the Stripe env is configured
-- (the app gates on STRIPE_SECRET_KEY presence). The OWNER's manual 'business'
-- row is comped so billing can NEVER brick the dogfood / A1–A4 test account.
--
-- Additive only (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS). Explicit
-- RLS per the going-forward convention. 3-part verify (information_schema +
-- pg_policies + relrowsecurity) recommended after apply.

-- ── user_subscriptions: Stripe sync columns + comped flag ───────────────────
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id     text;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS status                 text
  CHECK (status IS NULL OR status IN
    ('active','trialing','past_due','canceled','incomplete','incomplete_expired','unpaid','paused'));
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS price_id               text;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS current_period_end     timestamptz;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end   boolean NOT NULL DEFAULT false;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS trial_end              timestamptz;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS comped                 boolean NOT NULL DEFAULT false;

-- The webhook resolves the user by stripe_customer_id — index it.
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer
  ON user_subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Grandfather the owner (dogfood + A1–A4 rig). comped → always Pro access; the
-- webhook never downgrades a comped row. Idempotent.
UPDATE user_subscriptions SET comped = true
  WHERE user_id = '312f9366-dbb4-49e2-8b89-48286fb93b3b';

-- ── stripe_events: webhook idempotency ledger ───────────────────────────────
-- Dedup by Stripe event id. INSERT-or-skip (unique violation) is the atomic
-- claim: a re-delivered event short-circuits without re-applying side effects.
CREATE TABLE IF NOT EXISTS stripe_events (
  id          text PRIMARY KEY,        -- Stripe event id (evt_…)
  type        text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
-- Service-role only (the webhook writes via createServiceClient; no client reads).
-- No policies → RLS denies all non-service access by default.

-- user_subscriptions RLS: it predates the explicit-RLS convention; ensure it's
-- enabled + a host-can-read-own policy exists (idempotent). All writes are
-- service-role (webhook / billing routes), which bypasses RLS.
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_subscriptions'
      AND policyname = 'user_subscriptions_select_own'
  ) THEN
    CREATE POLICY user_subscriptions_select_own ON user_subscriptions
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
