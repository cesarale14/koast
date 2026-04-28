// Session 6.3 — single source of truth for mapping a Channex booking
// entity into a Koast bookings row. Used by the webhook handler at
// /api/webhooks/channex and any future TS-side sync route. The Python
// poller (~/koast-workers/booking_sync.py) keeps an in-sync
// copy of this mapping — when fields change here, mirror them there.

import type { SupabaseClient } from "@supabase/supabase-js";

// Subset of ChannexBooking.attributes we depend on. Loose typing
// because Channex returns extra fields we don't model.
export interface ChannexBookingAttrs {
  status?: string | null;
  arrival_date?: string | null;
  departure_date?: string | null;
  amount?: string | null;
  currency?: string | null;
  notes?: string | null;
  ota_reservation_code?: string | null;
  ota_name?: string | null;
  unique_id?: string | null;
  revision?: number | null;
  customer?: {
    name?: string | null;
    surname?: string | null;
    mail?: string | null;
    phone?: string | null;
  } | null;
}

export type UpsertAction = "created" | "modified" | "cancelled" | "promoted_ical";

export interface UpsertResult {
  action: UpsertAction;
  bookingRowId: string | null;
  oldCheckIn: string | null;
  oldCheckOut: string | null;
}

export function platformFromChannex(
  uniqueIdOrCode: string | null | undefined,
  otaName: string | null | undefined,
): "airbnb" | "booking_com" | "vrbo" | "direct" {
  const u = String(uniqueIdOrCode ?? "").toUpperCase();
  if (u.startsWith("BDC-")) return "booking_com";
  if (u.startsWith("ABB-")) return "airbnb";
  if (u.startsWith("VRBO-") || u.startsWith("HA-")) return "vrbo";
  const ota = (otaName ?? "").toLowerCase();
  if (ota.includes("airbnb")) return "airbnb";
  if (ota.includes("vrbo") || ota.includes("homeaway")) return "vrbo";
  if (ota.includes("booking")) return "booking_com";
  return "direct";
}

export interface BuildBookingRecordInput {
  propertyId: string;
  channexBookingId: string;
  attrs: ChannexBookingAttrs;
  /** Override the action — pass "cancelled" when the event is a cancellation. */
  forceCancelled?: boolean;
}

export function buildBookingRecordFromChannex(input: BuildBookingRecordInput) {
  const { propertyId, channexBookingId, attrs, forceCancelled } = input;
  const customer = attrs.customer ?? {};
  const firstName = (customer.name ?? "").trim() || null;
  const lastName = (customer.surname ?? "").trim() || null;
  const guestName = [firstName, lastName].filter(Boolean).join(" ") || null;
  const platform = platformFromChannex(attrs.unique_id ?? attrs.ota_reservation_code, attrs.ota_name);

  const cancelled =
    forceCancelled === true ||
    attrs.status === "cancelled";

  return {
    property_id: propertyId,
    platform,
    channex_booking_id: channexBookingId,
    guest_name: guestName,
    guest_first_name: firstName,
    guest_last_name: lastName,
    guest_email: customer.mail ?? null,
    guest_phone: customer.phone ?? null,
    check_in: attrs.arrival_date ?? null,
    check_out: attrs.departure_date ?? null,
    total_price: attrs.amount ? Number(attrs.amount) : null,
    currency: attrs.currency ?? "USD",
    status: cancelled ? "cancelled" : "confirmed",
    platform_booking_id: attrs.ota_reservation_code ?? null,
    ota_reservation_code: attrs.ota_reservation_code ?? null,
    revision_number: attrs.revision ?? null,
    source: "channex" as const,
    notes: attrs.notes ?? null,
    updated_at: new Date().toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any> | any;

/**
 * Upsert a Channex booking into the bookings table.
 *
 * Strategy:
 *   1. If a row exists by channex_booking_id → update it.
 *   2. Else if not cancelled, look for an iCal-sourced placeholder
 *      (same property + platform + dates, channex_booking_id null) →
 *      promote it by stamping Channex fields onto the existing row.
 *   3. Else insert a new row.
 *   4. Cancelled bookings without an existing row are skipped (no
 *      placeholder to update; nothing to do).
 *
 * Preserves local-only columns (cleaning_status, internal notes, etc)
 * because we always UPDATE rather than DELETE + INSERT. The bookingRecord
 * intentionally omits those columns, so they ride through untouched.
 */
export async function upsertBookingFromChannexRevision(input: {
  supabase: AnySupabase;
  propertyId: string;
  channexBookingId: string;
  attrs: ChannexBookingAttrs;
  forceCancelled?: boolean;
}): Promise<UpsertResult> {
  const { supabase, propertyId, channexBookingId, attrs, forceCancelled } = input;
  const record = buildBookingRecordFromChannex({ propertyId, channexBookingId, attrs, forceCancelled });
  const cancelled = record.status === "cancelled";

  const { data: existingData } = await supabase
    .from("bookings")
    .select("id, check_in, check_out")
    .eq("channex_booking_id", channexBookingId)
    .limit(1);
  const existing = (existingData ?? [])[0] ?? null;

  if (existing) {
    await supabase.from("bookings").update(record).eq("id", existing.id);
    return {
      action: cancelled ? "cancelled" : "modified",
      bookingRowId: existing.id,
      oldCheckIn: existing.check_in ?? null,
      oldCheckOut: existing.check_out ?? null,
    };
  }

  if (cancelled) {
    return { action: "cancelled", bookingRowId: null, oldCheckIn: null, oldCheckOut: null };
  }

  // iCal placeholder promotion — same platform, exact-date match,
  // no channex_booking_id. Cross-platform overlaps are real
  // overbookings and must be left alone.
  const { data: exact } = await supabase
    .from("bookings")
    .select("id")
    .eq("property_id", propertyId)
    .eq("platform", record.platform)
    .eq("check_in", record.check_in)
    .eq("check_out", record.check_out)
    .is("channex_booking_id", null)
    .eq("status", "confirmed")
    .limit(1);
  const exactRow = (exact ?? [])[0] ?? null;
  if (exactRow) {
    await supabase.from("bookings").update(record).eq("id", exactRow.id);
    return { action: "promoted_ical", bookingRowId: exactRow.id, oldCheckIn: null, oldCheckOut: null };
  }

  const { data: inserted, error } = await supabase
    .from("bookings")
    .insert(record)
    .select("id")
    .limit(1);
  if (error) {
    throw new Error(`bookings insert failed: ${error.message}`);
  }
  return {
    action: "created",
    bookingRowId: ((inserted ?? [])[0] as { id: string } | undefined)?.id ?? null,
    oldCheckIn: null,
    oldCheckOut: null,
  };
}
