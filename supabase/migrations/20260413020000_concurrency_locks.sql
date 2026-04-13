-- Simple advisory-lock table for serializing risky multi-step operations
-- that can't fit into a single DB transaction (e.g. BDC channel connect,
-- which interleaves Channex API calls with Supabase inserts). Callers
-- INSERT a row with an expiration and check the return — if the insert
-- conflicted, another request is holding the lock.

CREATE TABLE IF NOT EXISTS concurrency_locks (
  lock_key    text PRIMARY KEY,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_concurrency_locks_expires
  ON concurrency_locks(expires_at);

-- Helper to clean up stale locks older than their expiration. Called
-- opportunistically by lock acquisition code.
CREATE OR REPLACE FUNCTION release_stale_locks() RETURNS integer AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM concurrency_locks WHERE expires_at < now() RETURNING 1 INTO deleted;
  RETURN COALESCE(deleted, 0);
END;
$$ LANGUAGE plpgsql;
