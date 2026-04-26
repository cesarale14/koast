import crypto from "crypto";

const DEFAULT_CHECKLIST = [
  { id: "linens", label: "Linens changed", done: false },
  { id: "bathrooms", label: "Bathrooms cleaned", done: false },
  { id: "kitchen", label: "Kitchen cleaned", done: false },
  { id: "floors", label: "Floors vacuumed/mopped", done: false },
  { id: "trash", label: "Trash taken out", done: false },
  { id: "amenities", label: "Amenities restocked", done: false },
  { id: "exterior", label: "Exterior/patio cleaned", done: false },
  { id: "lockbox", label: "Lockbox code updated", done: false },
];

function generateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function createCleaningTask(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  booking: {
    id: string;
    property_id: string;
    check_out: string;
  }
): Promise<string | null> {
  // Check if task already exists for this booking
  const { data: existing } = await supabase
    .from("cleaning_tasks")
    .select("id")
    .eq("booking_id", booking.id)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (((existing ?? []) as any[]).length > 0) {
    return (existing as { id: string }[])[0].id;
  }

  // Find the next booking for this property after checkout
  const { data: nextBookings } = await supabase
    .from("bookings")
    .select("id, check_in, guest_name")
    .eq("property_id", booking.property_id)
    .gt("check_in", booking.check_out)
    .in("status", ["confirmed", "pending"])
    .order("check_in")
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextBooking = ((nextBookings ?? []) as any[])[0] ?? null;

  // Look up default_cleaner_id + the property's name + user_id in
  // one trip. user_id flows into notifyCleanerAssigned as
  // `opts.userId` so sms_log.user_id gets populated (TURN-S1a
  // Amendment 7 — was previously NULL on every iCal-source create
  // and will be the dominant case once the trigger is live).
  const { data: propLookup } = await supabase
    .from("properties")
    .select("default_cleaner_id, name, user_id")
    .eq("id", booking.property_id)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propLookupRow = ((propLookup ?? []) as any[])[0] ?? null;
  const defaultCleanerId: string | null = propLookupRow?.default_cleaner_id ?? null;

  const taskData = {
    property_id: booking.property_id,
    booking_id: booking.id,
    next_booking_id: nextBooking?.id ?? null,
    status: defaultCleanerId ? "assigned" : "pending",
    cleaner_id: defaultCleanerId,
    scheduled_date: booking.check_out,
    scheduled_time: "11:30:00", // checkout 11am + 30min buffer
    checklist: DEFAULT_CHECKLIST,
    cleaner_token: generateToken(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("cleaning_tasks") as any)
    .insert(taskData)
    .select("id, cleaner_token")
    .single();

  if (error) {
    // TURN-S1a Amendment 2 — TOCTOU race tolerance: another concurrent
    // caller (typically the trigger fired after the host clicked
    // Auto-Create, or vice versa) may have inserted the same booking
    // between our SELECT-then-INSERT guard above and this call. The
    // UNIQUE constraint on cleaning_tasks.booking_id catches that and
    // raises 23505. Treat as no-op success and return the existing
    // task id so callers see consistent behavior.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.code === "23505") {
      const { data: raceWinner } = await supabase
        .from("cleaning_tasks").select("id").eq("booking_id", booking.id).limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const winner = ((raceWinner ?? []) as any[])[0];
      if (winner?.id) {
        console.log(`[turnover/auto-create] 23505 race won by concurrent insert; returning existing task ${winner.id}`);
        return winner.id;
      }
    }
    console.error("[turnover/auto-create] Insert error:", error);
    return null;
  }

  // Reuse the property lookup from above for name + user_id.
  const propName: string = propLookupRow?.name ?? "Property";
  const propUserId: string | null = propLookupRow?.user_id ?? null;

  // Auto-send SMS to default cleaner
  if (defaultCleanerId && data) {
    try {
      const { notifyCleanerAssigned } = await import("@/lib/notifications");
      const { data: cleanerRows } = await supabase
        .from("cleaners").select("id, name, phone").eq("id", defaultCleanerId).limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cleaner = ((cleanerRows ?? []) as any[])[0];
      if (cleaner) {
        // TURN-S1a Amendment 7 — pass userId so sms_log.user_id gets
        // populated for trigger-fired auto-assigns. Was previously
        // NULL for every iCal-source create; the trigger path makes
        // this the dominant case.
        await notifyCleanerAssigned(supabase,
          { id: data.id, scheduled_date: booking.check_out, cleaner_token: data.cleaner_token },
          propName, cleaner, { userId: propUserId ?? undefined });
      }
    } catch (err) {
      console.error("[turnover/auto-create] SMS notification failed:", err);
    }
  }

  return data?.id ?? null;
}

export async function backfillCleaningTasks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId?: string
): Promise<{ created: number; skipped: number }> {
  const today = new Date().toISOString().split("T")[0];

  // Get user's property IDs if userId provided
  let propIds: string[] | null = null;
  if (userId) {
    const { data: props } = await supabase
      .from("properties")
      .select("id")
      .eq("user_id", userId);
    propIds = ((props ?? []) as { id: string }[]).map((p) => p.id);
    if (propIds.length === 0) return { created: 0, skipped: 0 };
  }

  // Find confirmed bookings with checkouts from today onwards — scoped to user
  let query = supabase
    .from("bookings")
    .select("id, property_id, check_out")
    .gte("check_out", today)
    .in("status", ["confirmed", "completed"])
    .order("check_out");
  if (propIds) query = query.in("property_id", propIds);
  const { data: bookings } = await query;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allBookings = (bookings ?? []) as any[];

  let created = 0;
  let skipped = 0;

  for (const booking of allBookings) {
    const taskId = await createCleaningTask(supabase, booking);
    if (taskId) {
      // Check if we actually created it (vs it already existed)
      const { data: task } = await supabase
        .from("cleaning_tasks")
        .select("created_at")
        .eq("id", taskId)
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const taskRow = ((task ?? []) as any[])[0];
      const age = Date.now() - new Date(taskRow?.created_at ?? 0).getTime();
      if (age < 5000) {
        created++;
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }
  }

  return { created, skipped };
}

export { DEFAULT_CHECKLIST };
