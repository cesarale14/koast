-- Koast v1 — P1.5b (S3b): cleaner photo-confirm.
--
-- Additive. Two changes:
--   1. A PRIVATE Supabase Storage bucket `cleaning-photos` for cleaner
--      completion photos. Private (public=false) + image-only mime allow-list +
--      10 MB cap as defense-in-depth. All access is server-mediated: the
--      token-verified upload route uploads via the service role, and the host/
--      cleaner view via short-lived signed URLs. No anon/authenticated policy on
--      storage.objects for this bucket → deny-by-default for direct client access
--      (service role bypasses RLS; signed URLs carry their own grant).
--   2. property_details.require_completion_photos — the per-property
--      "must photograph before completing" gate. Default ON.
--
-- No table created (storage.objects/buckets are Supabase-managed and already
-- RLS-enabled; property_details already exists + is RLS-enabled), so no explicit
-- ENABLE ROW LEVEL SECURITY is needed here.
--
-- Verify (staging + prod):
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'cleaning-photos';
--   select column_name, data_type, column_default
--     from information_schema.columns
--     where table_name = 'property_details' and column_name = 'require_completion_photos';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cleaning-photos',
  'cleaning-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

alter table property_details
  add column if not exists require_completion_photos boolean not null default true;
