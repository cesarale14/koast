import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { geocodeAddress } from "@/lib/geocode";

export async function POST() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();

    // Fetch properties with null latitude belonging to this user
    const { data: props, error: fetchErr } = await supabase
      .from("properties")
      .select("id, address, city, state")
      .eq("user_id", user.id)
      .is("latitude", null);

    if (fetchErr) throw fetchErr;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = (props ?? []) as any[];
    let updated = 0;
    let failed = 0;

    for (const prop of properties) {
      if (!prop.address && !prop.city) {
        failed++;
        continue;
      }

      const result = await geocodeAddress(prop.address, prop.city, prop.state);

      if (result) {
        const { error: updateErr } = await supabase
          .from("properties")
          .update({ latitude: result.lat, longitude: result.lng })
          .eq("id", prop.id);

        if (updateErr) {
          console.error(`[geocode-all] Failed to update ${prop.id}:`, updateErr);
          failed++;
        } else {
          updated++;
        }
      } else {
        failed++;
      }

      // Nominatim rate limit: max 1 request per second
      await new Promise((r) => setTimeout(r, 1100));
    }

    return NextResponse.json({ total: properties.length, updated, failed });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
