import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(
  _request: Request,
  { params }: { params: { taskId: string; token: string } }
) {
  try {
    const supabase = createServiceClient();

    // Validate token
    const { data: tasks } = await supabase
      .from("cleaning_tasks")
      .select("id, property_id, booking_id, next_booking_id, status, scheduled_date, scheduled_time, checklist, notes, cleaner_token")
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
      checkoutGuest,
      nextGuest,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
