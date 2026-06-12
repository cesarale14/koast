-- P6.3 — abuse-surface hardening: a shared rate-limit primitive + cleaner-token rotation.
--
-- Additive only. Two concerns in one migration because both land with the P6.3
-- cleaner-token-route hardening:
--
--  (1) rate_limits — a DB-backed fixed-window counter (no Redis in this stack;
--      Vercel serverless instances don't share memory, so the limiter must be
--      shared state). One atomic SECURITY-DEFINER function does the increment-and-
--      check so callers never race. Service-role only (RLS on, no policies).
--
--  (2) cleaning_tasks.token_invalidated_at / token_expires_at — let a host rotate a
--      cleaner link (the old token stops working immediately) and let tokens lapse.

-- ── (1) rate_limits ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket_key   text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

-- RLS on with no policies: only the service role (which bypasses RLS) may touch it.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Index for the periodic prune of expired windows.
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON public.rate_limits (window_start);

-- Atomic fixed-window hit: bump the counter for the current window and report
-- whether the caller is still under the limit. SECURITY DEFINER so it runs with
-- the table owner's rights regardless of caller.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_key            text,
  p_window_seconds integer,
  p_limit          integer
) RETURNS TABLE(allowed boolean, current_count integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count        integer;
BEGIN
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limits (bucket_key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO v_count;

  RETURN QUERY SELECT
    (v_count <= p_limit),
    v_count,
    (v_window_start + make_interval(secs => p_window_seconds));
END;
$$;

-- Opportunistic prune helper (call from the validator cron or /api/health detail).
CREATE OR REPLACE FUNCTION public.rate_limit_prune(p_older_than_seconds integer DEFAULT 86400)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < now() - make_interval(secs => p_older_than_seconds);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ── (2) cleaner-token rotation columns ──────────────────────────────────────
ALTER TABLE public.cleaning_tasks
  ADD COLUMN IF NOT EXISTS token_invalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_expires_at     timestamptz;
