import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import SyncLogDashboard from "@/components/dashboard/SyncLogDashboard";

export default async function SyncLogPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const service = createServiceClient();

  // Get user's property channex IDs
  const { data: userProps } = await service
    .from("properties")
    .select("id, name, channex_property_id")
    .eq("user_id", user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = (userProps ?? []) as any[];
  const channexIds = properties
    .map((p) => p.channex_property_id)
    .filter(Boolean) as string[];

  // Build a map of channex_property_id -> property name
  const propertyNameMap: Record<string, string> = {};
  for (const p of properties) {
    if (p.channex_property_id) {
      propertyNameMap[p.channex_property_id] = p.name;
    }
  }

  // Fetch initial logs
  let initialLogs: Record<string, unknown>[] = [];
  let totalCount = 0;

  if (channexIds.length > 0) {
    const { data, count } = await service
      .from("channex_webhook_log")
      .select("*", { count: "exact" })
      .in("channex_property_id", channexIds)
      .order("created_at", { ascending: false })
      .range(0, 49);
    initialLogs = (data ?? []) as Record<string, unknown>[];
    totalCount = count ?? 0;
  }

  return (
    <SyncLogDashboard
      initialLogs={initialLogs}
      totalCount={totalCount}
      propertyNameMap={propertyNameMap}
      hasChannexProperties={channexIds.length > 0}
    />
  );
}
