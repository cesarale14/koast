/**
 * POST /api/properties — the single server-side property-creation chokepoint for
 * the client add-paths (the onboarding wizard + the manual /properties/new form).
 *
 * It INSERTs the property and then runs bootstrapNewProperty, so the launch
 * invariant (non-null timezone → agenda-visible, a property_details row, an
 * optional rate seed) holds for every property a host creates from the browser.
 * The two server-side import routes call bootstrapNewProperty inline themselves.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bootstrapNewProperty } from "@/lib/properties/bootstrap";

export const dynamic = "force-dynamic";

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
function int(v: unknown): number | null {
  const n = num(v);
  return n == null ? null : Math.trunc(n);
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name = (body.name ?? "").toString().trim();
    if (!name) return NextResponse.json({ error: "Property name is required" }, { status: 400 });

    const latitude = num(body.latitude);
    const longitude = num(body.longitude);

    const { data: inserted, error: insertErr } = await supabase
      .from("properties")
      .insert({
        user_id: user.id,
        name,
        address: body.address || null,
        city: body.city || null,
        state: body.state || null,
        zip: body.zip || null,
        latitude,
        longitude,
        bedrooms: int(body.bedrooms),
        bathrooms: num(body.bathrooms),
        max_guests: int(body.max_guests),
        property_type: body.property_type || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select("id")
      .single();

    if (insertErr) {
      // The enforce_property_quota trigger is the authoritative free-tier gate;
      // surface it in friendly wording rather than leaking the raw error.
      const raw = insertErr.message ?? "";
      if (raw.includes("property_quota_exceeded") || raw.includes("free_tier_limit_exceeded")) {
        return NextResponse.json(
          { error: "Free plan is limited to 1 property. Upgrade to Pro to add more." },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: `Property insert failed: ${raw}` }, { status: 500 });
    }

    const propertyId = (inserted as { id: string }).id;

    // The launch invariant: tz never null + a property_details row + (when a
    // base rate is supplied) a seeded calendar_rates base layer.
    const baseRate = num(body.base_rate);
    const bootstrap = await bootstrapNewProperty(supabase, {
      propertyId,
      latitude,
      longitude,
      country: body.country ?? null,
      baseRate,
      minStay: int(body.min_stay),
      rateSource: baseRate != null ? "manual" : "default",
    });

    return NextResponse.json({
      id: propertyId,
      timezone: bootstrap.timezone,
      rates_seeded: bootstrap.ratesSeeded,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error creating property" },
      { status: 500 },
    );
  }
}
