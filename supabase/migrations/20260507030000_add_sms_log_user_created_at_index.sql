-- M8 Phase A · D3 — composite index for unified_audit_feed query patterns.
--
-- Phase 1 STOP audit (Category 3) found sms_log has only a single-column
-- idx_sms_log_user index. The unified_audit_feed VIEW filters every
-- source by (host_id, occurred_at) for the inspect surface's reverse-
-- chronological feed. sms_log aliases user_id to host_id in the VIEW
-- projection; the underlying query needs the composite index.

CREATE INDEX IF NOT EXISTS idx_sms_log_user_created_at
  ON sms_log(user_id, created_at DESC);
