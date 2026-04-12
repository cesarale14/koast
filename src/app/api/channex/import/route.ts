import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServerClient } from "@supabase/ssr";
import { createChannexClient } from "@/lib/channex/client";

// Create a service-role client that bypasses RLS
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    // Fall back to anon client if service role key is not set
    console.warn("[channex/import] SUPABASE_SERVICE_ROLE_KEY not set, using anon client (RLS will apply)");
    return createClient();
  }
  return createServerClient(url, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}

// GET: preview properties from Channex
export async function GET() {
  try {
    const channex = createChannexClient();
    const properties = await channex.getProperties();

    const preview = properties.map((p) => ({
      channex_id: p.id,
      name: p.attributes.title,
      city: p.attributes.city,
      country: p.attributes.country,
      currency: p.attributes.currency,
      is_active: p.attributes.is_active,
    }));

    return NextResponse.json({ properties: preview });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[channex/import GET] Error:", err);
    if (message.includes("CHANNEX_API_KEY")) {
      return NextResponse.json(
        { error: "Channex API key not configured. Add CHANNEX_API_KEY to your environment." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: `Failed to connect to Channex: ${message}` },
      { status: 500 }
    );
  }
}

// POST: import selected properties
export async function POST(request: NextRequest) {
  try {
    const { channex_ids } = await request.json();
    if (!Array.isArray(channex_ids) || channex_ids.length === 0) {
      return NextResponse.json(
        { error: "No properties selected" },
        { status: 400 }
      );
    }

    // Get user ID from session (anon client for auth)
    const authClient = createClient();
    const { data: { user } } = await authClient.auth.getUser();
    const userId = user?.id;
    console.log("[channex/import POST] User ID:", userId ?? "NOT AUTHENTICATED");

    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated. Please log in first." },
        { status: 401 }
      );
    }

    // Use service role client for DB writes (bypasses RLS)
    const supabase = createServiceClient();
    const channex = createChannexClient();

    const today = new Date().toISOString().split("T")[0];
    const end90 = new Date();
    end90.setDate(end90.getDate() + 90);
    const endDate = end90.toISOString().split("T")[0];

    const results = [];

    for (const channexId of channex_ids) {
      try {
        // 1. Fetch property details from Channex
        console.log(`[channex/import] Fetching property ${channexId} from Channex...`);
        const prop = await channex.getProperty(channexId);
        const attrs = prop.attributes;
        console.log(`[channex/import] Got property: "${attrs.title}" (${attrs.city}, ${attrs.country})`);

        // 2. Insert property into Supabase
        const propInsert = {
          user_id: userId,
          name: attrs.title,
          address: attrs.address || null,
          city: attrs.city || null,
          state: attrs.state || null,
          zip: attrs.zip_code || null,
          latitude: attrs.latitude ? Number(attrs.latitude) : null,
          longitude: attrs.longitude ? Number(attrs.longitude) : null,
          channex_property_id: channexId,
        };
        console.log("[channex/import] Inserting property:", JSON.stringify(propInsert));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const propTable = supabase.from("properties") as any;

        // Try to find existing property first — by channex_property_id
        const { data: existing } = await propTable
          .select("id, channex_property_id")
          .eq("channex_property_id", channexId)
          .limit(1);

        let propertyId: string;
        let migratedFromScaffold = false;
        let oldChannexPropertyId: string | null = null;

        if (existing && existing.length > 0) {
          // Update existing (already linked to this Channex property)
          propertyId = existing[0].id;
          const { error: updateErr } = await propTable
            .update(propInsert)
            .eq("id", propertyId);
          if (updateErr) {
            console.error("[channex/import] Property update error:", JSON.stringify(updateErr));
            throw new Error(`Property update failed: ${updateErr.message}`);
          }
          console.log(`[channex/import] Updated existing property ${propertyId}`);
        } else {
          // No exact channex_property_id match — check for a name match
          // (catches properties created via onboarding that later connected
          // BDC with a scaffold, or properties without any Channex link)
          const propName = (attrs.title || "").toLowerCase()
            .replace(/\s*(in|-)?\s*(tampa|orlando|miami|jacksonville|st\.?\s*pete).*$/i, "").trim();
          const { data: nameMatches } = await propTable
            .select("id, name, channex_property_id")
            .eq("user_id", userId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nameMatch = (nameMatches ?? []).find((p: any) => {
            const mName = (p.name || "").toLowerCase()
              .replace(/\s*-\s*(tampa|orlando|miami|jacksonville|st\.?\s*pete).*$/i, "").trim();
            return (
              mName === propName ||
              mName.includes(propName) ||
              propName.includes(mName)
            );
          });

          if (nameMatch) {
            // Found a Moora property by name — update it with the real Channex ID
            propertyId = nameMatch.id;
            oldChannexPropertyId = nameMatch.channex_property_id;
            migratedFromScaffold = !!oldChannexPropertyId && oldChannexPropertyId !== channexId;
            const { error: updateErr } = await propTable
              .update(propInsert)
              .eq("id", propertyId);
            if (updateErr) {
              console.error("[channex/import] Property name-match update error:", JSON.stringify(updateErr));
              throw new Error(`Property update failed: ${updateErr.message}`);
            }
            console.log(`[channex/import] Matched by name "${nameMatch.name}" → updating with real Channex ID ${channexId}${migratedFromScaffold ? ` (was scaffold ${oldChannexPropertyId})` : ""}`);
          } else {
            // No match at all — insert new property
            const { data: newProp, error: insertErr } = await propTable
              .insert(propInsert)
              .select("id")
              .single();
            if (insertErr) {
              console.error("[channex/import] Property insert error:", JSON.stringify(insertErr));
              throw new Error(`Property insert failed: ${insertErr.message}`);
            }
            propertyId = newProp.id;
            console.log(`[channex/import] Inserted new property ${propertyId}`);
          }
        }

        // 3. Fetch room types → create listings
        console.log(`[channex/import] Fetching room types for ${channexId}...`);
        let roomsImported = 0;
        try {
          const roomTypes = await channex.getRoomTypes(channexId);
          console.log(`[channex/import] Got ${roomTypes.length} room types`);

          for (const rt of roomTypes) {
            const listingData = {
              property_id: propertyId,
              platform: "direct" as const,
              channex_room_id: rt.id,
              platform_listing_id: rt.id,
              status: "active",
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const listTable = supabase.from("listings") as any;

            // Check if listing exists
            const { data: existingListing } = await listTable
              .select("id")
              .eq("property_id", propertyId)
              .eq("channex_room_id", rt.id)
              .limit(1);

            if (existingListing && existingListing.length > 0) {
              await listTable.update(listingData).eq("id", existingListing[0].id);
            } else {
              const { error: listErr } = await listTable.insert(listingData);
              if (listErr) {
                console.error("[channex/import] Listing insert error:", JSON.stringify(listErr));
                // Don't throw — continue with other room types
              }
            }
            roomsImported++;
          }
        } catch (rtErr) {
          console.error("[channex/import] Room types error:", rtErr);
        }

        // 3b. If migrating from scaffold, update room types, rate plans, and BDC channel
        if (migratedFromScaffold && oldChannexPropertyId) {
          try {
            const realRoomTypes = await channex.getRoomTypes(channexId);
            const realRatePlans = await channex.getRatePlans(channexId);
            const realRtId = realRoomTypes[0]?.id;
            const realRpId = realRatePlans[0]?.id;

            if (realRtId) {
              // Remove old scaffold room type/rate plan, insert real ones
              await supabase.from("channex_rate_plans").delete().eq("property_id", propertyId);
              await supabase.from("channex_room_types").delete().eq("property_id", propertyId);

              await supabase.from("channex_room_types").upsert({
                id: realRtId,
                property_id: propertyId,
                channex_property_id: channexId,
                title: realRoomTypes[0].attributes?.title || "Entire Home",
                count_of_rooms: 1,
                occ_adults: realRoomTypes[0].attributes?.occ_adults || 6,
                cached_at: new Date().toISOString(),
              }, { onConflict: "id" });

              if (realRpId) {
                await supabase.from("channex_rate_plans").upsert({
                  id: realRpId,
                  property_id: propertyId,
                  room_type_id: realRtId,
                  title: realRatePlans[0].attributes?.title || "Best Available Rate",
                  sell_mode: "per_room",
                  currency: "USD",
                  rate_mode: "manual",
                  cached_at: new Date().toISOString(),
                }, { onConflict: "id" });
              }
              console.log(`[channex/import] Migrated room type ${realRtId} and rate plan ${realRpId} from scaffold`);
            }

            // Update any BDC channel that was pointing to the scaffold
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const allChannels = await channex.getAllChannels();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bdcChannel = (allChannels.data ?? []).find((ch: any) => {
              const props: string[] = ch.attributes?.properties ?? [];
              return ch.attributes?.channel === "BookingCom" && props.includes(oldChannexPropertyId!);
            });

            if (bdcChannel && realRtId) {
              const oldProps: string[] = bdcChannel.attributes?.properties ?? [];
              const newProps = oldProps.map((p: string) => p === oldChannexPropertyId ? channexId : p);
              await channex.updateChannel(bdcChannel.id, {
                properties: newProps,
              });
              console.log(`[channex/import] Migrated BDC channel ${bdcChannel.id} from scaffold ${oldChannexPropertyId} → ${channexId}`);
            }
          } catch (migErr) {
            console.error("[channex/import] Scaffold migration error:", migErr);
            // Non-fatal — property import continues
          }
        }

        // 4. Fetch bookings for next 90 days
        console.log(`[channex/import] Fetching bookings for ${channexId}...`);
        let bookingsImported = 0;
        try {
          const bookings = await channex.getBookings({
            propertyId: channexId,
            departureFrom: today,
            arrivalTo: endDate,
          });
          console.log(`[channex/import] Got ${bookings.length} bookings`);

          for (const booking of bookings) {
            const ba = booking.attributes;
            if (ba.status === "cancelled") continue;

            const guestName = ba.customer
              ? [ba.customer.name, ba.customer.surname].filter(Boolean).join(" ")
              : null;

            let platform = "direct";
            const otaLower = (ba.ota_name ?? "").toLowerCase();
            if (otaLower.includes("airbnb")) platform = "airbnb";
            else if (otaLower.includes("vrbo") || otaLower.includes("homeaway")) platform = "vrbo";
            else if (otaLower.includes("booking")) platform = "booking_com";

            const bookingData = {
              property_id: propertyId,
              platform,
              channex_booking_id: booking.id,
              guest_name: guestName,
              guest_email: ba.customer?.mail || null,
              guest_phone: ba.customer?.phone || null,
              check_in: ba.arrival_date,
              check_out: ba.departure_date,
              total_price: ba.amount ? parseFloat(ba.amount) : null,
              currency: ba.currency || "USD",
              status: "confirmed",
              platform_booking_id: ba.ota_reservation_code || null,
              notes: ba.notes || null,
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bookTable = supabase.from("bookings") as any;
            const { data: existingBooking } = await bookTable
              .select("id")
              .eq("channex_booking_id", booking.id)
              .limit(1);

            if (existingBooking && existingBooking.length > 0) {
              await bookTable.update(bookingData).eq("id", existingBooking[0].id);
            } else {
              const { error: bookErr } = await bookTable.insert(bookingData);
              if (bookErr) {
                console.error("[channex/import] Booking insert error:", JSON.stringify(bookErr));
              }
            }
            bookingsImported++;
          }
        } catch (bErr) {
          console.error("[channex/import] Bookings error:", bErr);
        }

        // 5. Fetch rates → populate calendar_rates
        console.log(`[channex/import] Fetching rates for ${channexId}...`);
        let ratesImported = 0;
        try {
          const restrictions = await channex.getRestrictions(channexId, today, endDate);
          console.log(`[channex/import] Got ${restrictions.length} rate entries`);

          for (const r of restrictions) {
            const ra = r.attributes;
            const rateValue = ra.rate ? (ra.rate / 100) : null; // Channex stores in cents

            const rateData = {
              property_id: propertyId,
              date: ra.date,
              applied_rate: rateValue,
              base_rate: rateValue,
              min_stay: ra.min_stay_arrival || 1,
              is_available: !ra.stop_sell,
              rate_source: "manual",
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rateTable = supabase.from("calendar_rates") as any;
            const { data: existingRate } = await rateTable
              .select("id")
              .eq("property_id", propertyId)
              .eq("date", ra.date)
              .limit(1);

            if (existingRate && existingRate.length > 0) {
              await rateTable.update(rateData).eq("id", existingRate[0].id);
            } else {
              const { error: rateErr } = await rateTable.insert(rateData);
              if (rateErr) {
                console.error("[channex/import] Rate insert error:", JSON.stringify(rateErr));
              }
            }
            ratesImported++;
          }
        } catch (rErr) {
          console.error("[channex/import] Rates error:", rErr);
          // Non-fatal — some properties may not have rates
        }

        console.log(`[channex/import] Done: ${attrs.title} — ${roomsImported} rooms, ${bookingsImported} bookings, ${ratesImported} rates`);

        results.push({
          channex_id: channexId,
          property_id: propertyId,
          name: attrs.title,
          status: "imported",
          rooms: roomsImported,
          bookings: bookingsImported,
          rates: ratesImported,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errStack = err instanceof Error ? err.stack : undefined;
        console.error(`[channex/import] Failed for ${channexId}:`, errMsg);
        if (errStack) console.error(errStack);

        results.push({
          channex_id: channexId,
          status: "error",
          error: errMsg,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[channex/import POST] Top-level error:", errMsg);
    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    );
  }
}
