import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import ConnectChannelWizard from "@/components/dashboard/ConnectChannelWizard";

export default async function ConnectChannelPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch user's properties with channex info
  const { data: propertiesData } = await supabase
    .from("properties")
    .select("id, name, channex_property_id")
    .eq("user_id", user.id)
    .order("name");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = (propertiesData ?? []) as any[];

  // Fetch existing channels for all properties
  const propertyIds = properties.map((p) => p.id);
  let existingChannels: Record<string, unknown>[] = [];
  if (propertyIds.length > 0) {
    const { data: channelsData } = await supabase
      .from("property_channels")
      .select("*")
      .in("property_id", propertyIds);
    existingChannels = (channelsData ?? []) as Record<string, unknown>[];
  }

  return (
    <Suspense fallback={<div className="animate-pulse h-96" />}>
      <ConnectChannelWizard
        properties={properties.map((p) => ({
          id: p.id,
          name: p.name,
          channexPropertyId: p.channex_property_id,
        }))}
        existingChannels={existingChannels}
      />
    </Suspense>
  );
}
