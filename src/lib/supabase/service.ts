import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS entirely.
 *
 * NOTE: We use @supabase/supabase-js directly (not @supabase/ssr's
 * createServerClient) because the SSR helper is designed for
 * cookie-based auth and can leak auth context that triggers RLS even
 * when given the service role key. This client has no auth state.
 *
 * Server-side use ONLY — never expose to the browser.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
