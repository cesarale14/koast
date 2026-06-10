import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET/PUT /api/properties/[propertyId]/access  (S3 — v1 program)
 *
 * The host-editable access content the cleaner job card surfaces (door code,
 * lockbox/smart-lock, wifi, parking + the property's check-in/out times). Lives
 * on property_details — which ships 0-row, so this is the only write path that
 * populates it. Owner-gated. updated_at is set explicitly (property_details has
 * no BEFORE UPDATE trigger, same as the properties table).
 */

const ACCESS_TEXT_FIELDS = [
  "door_code",
  "smart_lock_instructions",
  "wifi_network",
  "wifi_password",
  "parking_instructions",
] as const;

function hhmm(v: string | null | undefined): string {
  return v ? String(v).slice(0, 5) : "";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { propertyId: string } },
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await verifyPropertyOwnership(user.id, params.propertyId)))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = createServiceClient();
    const { data } = await supabase
      .from("property_details")
      .select(
        "door_code, smart_lock_instructions, wifi_network, wifi_password, parking_instructions, checkin_time, checkout_time",
      )
      .eq("property_id", params.propertyId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = ((data ?? []) as any[])[0] ?? {};

    return NextResponse.json({
      access: {
        door_code: row.door_code ?? "",
        smart_lock_instructions: row.smart_lock_instructions ?? "",
        wifi_network: row.wifi_network ?? "",
        wifi_password: row.wifi_password ?? "",
        parking_instructions: row.parking_instructions ?? "",
        checkin_time: hhmm(row.checkin_time),
        checkout_time: hhmm(row.checkout_time),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { propertyId: string } },
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await verifyPropertyOwnership(user.id, params.propertyId)))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const b = (body ?? {}) as Record<string, unknown>;

    const str = (v: unknown): string | null => {
      const s = typeof v === "string" ? v.trim() : "";
      return s === "" ? null : s;
    };
    // "HH:MM" or "HH:MM:SS" → "HH:MM:SS"; anything else (incl. blank) → undefined
    // so the column keeps its default/prior value rather than being nulled.
    const time = (v: unknown): string | undefined => {
      if (typeof v !== "string") return undefined;
      const t = v.trim();
      if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
      if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
      return undefined;
    };

    // Text fields are always written (null clears them). Times only when valid.
    const record: Record<string, unknown> = {
      property_id: params.propertyId,
      updated_at: new Date().toISOString(),
    };
    for (const f of ACCESS_TEXT_FIELDS) record[f] = str(b[f]);
    const ci = time(b.checkin_time);
    const co = time(b.checkout_time);
    if (ci !== undefined) record.checkin_time = ci;
    if (co !== undefined) record.checkout_time = co;

    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("property_details") as any).upsert(record, {
      onConflict: "property_id",
    });
    if (error) {
      return NextResponse.json({ error: `Save failed: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
