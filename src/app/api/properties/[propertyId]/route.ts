import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createChannexClient } from "@/lib/channex/client";
import { propertyUpdateSchema, flattenFieldErrors } from "@/lib/validators/properties";
import { geocodeAddress } from "@/lib/geocode";

/**
 * PUT /api/properties/[propertyId]
 *
 * Host-editable update from the Property Settings modal. Validates body via
 * `propertyUpdateSchema`. If the body has no lat/lng but does have an address,
 * server-side geocodes via Nominatim before writing.
 *
 * Note on Nominatim usage: the lift to server side means all geocode calls
 * originate from a single Vercel IP. Nominatim's 1 req/sec policy still holds
 * comfortably at our current write volume (a few property edits per day across
 * the fleet). A future bulk-import flow that exceeds that rate would need a
 * request queue or a paid geocoder.
 *
 * Note on `updated_at`: explicitly bumped here. Drizzle's `defaultNow()` only
 * fires on INSERT and there is no BEFORE UPDATE trigger on the properties
 * table, so other write paths (booking_sync, messaging sync, Channex
 * reconnect) leave `updated_at` stale. Tracked as a separate schema migration.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = propertyUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "validation_failed",
          field_errors: flattenFieldErrors(parsed.error.issues),
        },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = { ...parsed.data };

    // Server-side geocode fallback when lat/lng absent but address present.
    const hasCoords = data.latitude != null && data.longitude != null;
    const hasAddress = !!(data.address || data.city);
    if (!hasCoords && hasAddress) {
      try {
        const result = await geocodeAddress(
          (data.address as string | null | undefined) ?? null,
          (data.city as string | null | undefined) ?? null,
          (data.state as string | null | undefined) ?? null
        );
        if (result) {
          data.latitude = result.lat;
          data.longitude = result.lng;
        }
      } catch {
        /* geocode failure is non-fatal — save without coords */
      }
    }

    data.updated_at = new Date().toISOString();

    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase.from("properties") as any)
      .update(data)
      .eq("id", params.propertyId)
      .select()
      .limit(1);

    if (error) {
      return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = ((rows ?? []) as any[])[0] ?? null;
    return NextResponse.json({ ok: true, property: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[properties/PUT]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/properties/[propertyId]
 *
 * Removes a property and all of its local scoped data, AND cleans up
 * any Channex resources (channels, rate plans, room types, and the
 * property itself if this was its only Moora owner). Channex failures
 * are logged but don't block the local delete — an orphan in Channex
 * is a much smaller problem than a failed-delete in our own DB.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();
    const channex = createChannexClient();
    const propertyId = params.propertyId;
    const channexWarnings: string[] = [];

    // 1. Look up the Channex property id and any connected channels so we
    //    can clean them up before deleting the local row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: propRow } = await (supabase.from("properties") as any)
      .select("id, channex_property_id")
      .eq("id", propertyId)
      .maybeSingle();
    const channexPropertyId: string | null = propRow?.channex_property_id ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: channelRows } = await (supabase.from("property_channels") as any)
      .select("channex_channel_id, channel_code, settings")
      .eq("property_id", propertyId);

    // 2. Delete Channex channels this property owns. Each channel has an
    //    auto-generated ID; the channex_channel_id may be a real UUID or
    //    the synthetic "auto-<code>-<uuid>" form we use for auto-discovered
    //    rows — skip the synthetic ones since there's nothing in Channex
    //    to delete.
    for (const ch of (channelRows ?? []) as Array<{ channex_channel_id: string; channel_code: string; settings: { rate_plan_id?: string } | null }>) {
      if (ch.channex_channel_id.startsWith("auto-")) continue;
      try {
        await channex.deleteChannel(ch.channex_channel_id);
      } catch (err) {
        channexWarnings.push(`channel ${ch.channex_channel_id} (${ch.channel_code}): ${err instanceof Error ? err.message : String(err)}`);
      }
      // Also delete the channel-dedicated rate plan if we created one.
      const ratePlanId = ch.settings?.rate_plan_id;
      if (ratePlanId) {
        try {
          await channex.deleteRatePlan(ratePlanId);
        } catch (err) {
          channexWarnings.push(`rate_plan ${ratePlanId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // 3. Delete the Channex property itself only if no OTHER Moora
    //    property references it (two Moora properties could share the
    //    same Channex property if they were both migrated to the same
    //    real ID somehow).
    if (channexPropertyId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: otherProps } = await (supabase.from("properties") as any)
        .select("id")
        .eq("channex_property_id", channexPropertyId)
        .neq("id", propertyId);
      if (!otherProps || otherProps.length === 0) {
        try {
          await channex.deleteProperty(channexPropertyId);
        } catch (err) {
          channexWarnings.push(`property ${channexPropertyId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // 4. Cascade-delete local scoped tables, then the property itself.
    //    Mirror the list from /api/settings/delete-account.
    const scopedTables = [
      "pricing_outcomes",
      "market_comps",
      "market_snapshots",
      "local_events",
      "calendar_rates",
      "cleaning_tasks",
      "ical_feeds",
      "guest_reviews",
      "review_rules",
      "messages",
      "message_templates",
      "bookings",
      "listings",
      "property_details",
      "property_channels",
      "channex_room_types",
      "channex_rate_plans",
    ];
    for (const table of scopedTables) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from(table) as any).delete().eq("property_id", propertyId);
      } catch (err) {
        console.warn(`[properties/delete] Failed to delete from ${table}:`, err instanceof Error ? err.message : err);
      }
    }

    // 5. Finally delete the property row itself.
    const { error: delErr } = await supabase
      .from("properties")
      .delete()
      .eq("id", propertyId);
    if (delErr) {
      return NextResponse.json({ error: `Property delete failed: ${delErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      property_id: propertyId,
      channex_cleanup_warnings: channexWarnings,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[properties/delete]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
