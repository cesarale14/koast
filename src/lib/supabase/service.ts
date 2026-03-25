import { createServerClient } from "@supabase/ssr";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createServerClient(url, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
