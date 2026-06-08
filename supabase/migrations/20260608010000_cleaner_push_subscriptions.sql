-- TURN-S2-send — cleaner_push_subscriptions
-- Web-push subscription store for the cleaner PWA (replaces the spike's
-- in-memory hold and the abandoned SMS path). One row per installed
-- device/endpoint; bound to a cleaner so an assign fans out to all of that
-- cleaner's devices.
--
-- HELD: staging-first per docs/architecture/staging-environment.md. Apply to
-- staging (aljowaggoulsswtxdtmf) → verify → apply to production
-- (wxxpbgbfebpkvsxhpphb), recording each apply in koast_migration_history.
-- Do NOT apply until the operator confirms the flow.
--
-- Access is service-role only: the cleaner portal + subscribe + send paths all
-- use the Supabase service client (cleaners are not Supabase auth users; the
-- portal authenticates by task token). RLS is ENABLED with NO anon/authenticated
-- policies → deny-by-default for those roles; service_role bypasses RLS.
-- (Explicit-RLS discipline per CLAUDE.md "RLS enable is explicit, not implicit".)

CREATE TABLE IF NOT EXISTS public.cleaner_push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_id    uuid NOT NULL REFERENCES public.cleaners (id) ON DELETE CASCADE,
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Send-path lookup: all subscriptions for a cleaner.
CREATE INDEX IF NOT EXISTS idx_cleaner_push_subscriptions_cleaner
  ON public.cleaner_push_subscriptions (cleaner_id);

ALTER TABLE public.cleaner_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- No policies by design: only the service role (which bypasses RLS) reads/writes
-- this table. anon + authenticated are denied by default.

COMMENT ON TABLE public.cleaner_push_subscriptions IS
  'Web-push subscriptions for the cleaner PWA. Service-role access only (RLS on, no policies). TURN-S2-send.';
