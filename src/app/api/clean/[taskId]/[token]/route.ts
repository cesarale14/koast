import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getVapidPublicKey } from "@/lib/push/vapid";

export async function GET(
  _request: Request,
  { params }: { params: { taskId: string; token: string } }
) {
  try {
    const supabase = createServiceClient();

    // Validate token
    const { data: tasks } = await supabase
      .from("cleaning_tasks")
      .select("id, property_id, booking_id, next_booking_id, status, scheduled_date, scheduled_time, checklist, notes, cleaner_token, cleaner_id")
      .eq("id", params.taskId)
      .eq("cleaner_token", params.token)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const task = ((tasks ?? []) as any[])[0];
    if (!task) {
      return NextResponse.json({ error: "Invalid task or token" }, { status: 403 });
    }

    // Fetch property info
    const { data: props } = await supabase
      .from("properties")
      .select("name, address, city, state, zip")
      .eq("id", task.property_id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const property = ((props ?? []) as any[])[0] ?? {};

    // S3 — access content for the cleaner ("how to get in"). property_details
    // is canonical (host-editable); memory_facts (the agent's host-taught facts)
    // backfills door code + wifi password until the host fills the editor.
    const { data: pdRows } = await supabase
      .from("property_details")
      .select(
        "door_code, smart_lock_instructions, wifi_network, wifi_password, parking_instructions, checkin_time, checkout_time",
      )
      .eq("property_id", task.property_id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pd = ((pdRows ?? []) as any[])[0] ?? {};

    let factDoor: string | null = null;
    let factWifi: string | null = null;
    try {
      const { data: facts } = await supabase
        .from("memory_facts")
        .select("sub_entity_type, attribute, value")
        .eq("entity_type", "property")
        .eq("entity_id", task.property_id)
        .eq("status", "active")
        .in("sub_entity_type", ["front_door", "wifi"]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const f of (facts ?? []) as any[]) {
        const v = typeof f.value === "string" || typeof f.value === "number" ? String(f.value) : null;
        if (!v) continue;
        if (f.sub_entity_type === "front_door" && (f.attribute === "code" || !factDoor)) factDoor = v;
        if (f.sub_entity_type === "wifi" && (f.attribute === "password" || !factWifi)) factWifi = v;
      }
    } catch {
      /* memory_facts fallback is best-effort */
    }

    const access = {
      door_code: pd.door_code ?? factDoor ?? null,
      smart_lock_instructions: pd.smart_lock_instructions ?? null,
      wifi_network: pd.wifi_network ?? null,
      wifi_password: pd.wifi_password ?? factWifi ?? null,
      parking_instructions: pd.parking_instructions ?? null,
      checkin_time: pd.checkin_time ? String(pd.checkin_time).slice(0, 5) : null,
      checkout_time: pd.checkout_time ? String(pd.checkout_time).slice(0, 5) : null,
    };

    // Fetch booking info (checkout guest)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let checkoutGuest: any = null;
    if (task.booking_id) {
      const { data: b } = await supabase
        .from("bookings").select("guest_name, check_out").eq("id", task.booking_id).limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      checkoutGuest = ((b ?? []) as any[])[0] ?? null;
    }

    // Fetch next guest info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let nextGuest: any = null;
    if (task.next_booking_id) {
      const { data: b } = await supabase
        .from("bookings").select("guest_name, check_in").eq("id", task.next_booking_id).limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nextGuest = ((b ?? []) as any[])[0] ?? null;
    }

    return NextResponse.json({
      task: {
        id: task.id,
        status: task.status,
        scheduled_date: task.scheduled_date,
        scheduled_time: task.scheduled_time,
        checklist: task.checklist,
        notes: task.notes,
      },
      property,
      access,
      checkoutGuest,
      nextGuest,
      // TURN-S2-send: cleaner_id gates the enable-alerts UI (only an assigned
      // task can bind a device); vapidPublicKey is the browser
      // applicationServerKey. Null when push isn't configured (env unset).
      cleanerId: task.cleaner_id ?? null,
      vapidPublicKey: getVapidPublicKey(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
