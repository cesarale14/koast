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

function formatDateLabel(isoDate: string): string {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Resolve the cleaning window for a checkout: the next confirmed/pending
 * booking for the property whose check-in is after this checkout. Shared by
 * createCleaningTask (at create) and reconcileTaskOnModify (on date-drift) so
 * both compute next_booking_id the same way.
 */
async function resolveNextBookingId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  propertyId: string,
  checkOut: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("bookings")
    .select("id, check_in")
    .eq("property_id", propertyId)
    .gt("check_in", checkOut)
    .in("status", ["confirmed", "pending"])
    .order("check_in")
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])[0]?.id ?? null;
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

  // Resolve the cleaning window (next booking after checkout).
  const nextBookingId = await resolveNextBookingId(supabase, booking.property_id, booking.check_out);

  // Look up default_cleaner_id + the property's name in one trip
  // (name feeds the web-push dispatch body below).
  const { data: propLookup } = await supabase
    .from("properties")
    .select("default_cleaner_id, name")
    .eq("id", booking.property_id)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propLookupRow = ((propLookup ?? []) as any[])[0] ?? null;
  const defaultCleanerId: string | null = propLookupRow?.default_cleaner_id ?? null;

  const taskData = {
    property_id: booking.property_id,
    booking_id: booking.id,
    next_booking_id: nextBookingId,
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

  // Reuse the property lookup from above for the push body.
  const propName: string = propLookupRow?.name ?? "Property";

  // P1.1 — Auto-dispatch to the default cleaner via web-push (TURN-S2-send).
  // Create-time auto-assign previously fired the abandoned toll-free SMS
  // (notifyCleanerAssigned, carrier-filtered, never delivered); unify it onto
  // the same web-push path the manual assign route uses so every "cleaner
  // assigned" event uses one channel. Best-effort — never fails the create.
  if (defaultCleanerId && data) {
    try {
      const { sendAssignmentPush } = await import("@/lib/push/send");
      await sendAssignmentPush(supabase, {
        cleanerId: defaultCleanerId,
        url: `/clean/${data.id}/${data.cleaner_token}`,
        title: "New cleaning job",
        body: `${propName} · ${formatDateLabel(booking.check_out)}`,
      });
    } catch (err) {
      console.error("[turnover/auto-create] push notification failed:", err);
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

/**
 * P1.1 — booking-modification / date-drift reconciliation.
 *
 * When a Channex booking is modified and its checkout moves, the existing
 * cleaning task still points at the old date. Re-point it: update
 * scheduled_date + re-resolve next_booking_id (the cleaning window). If the
 * task is already assigned to a cleaner, re-push so they aren't holding a
 * stale date. No-op when there is no task, the date is unchanged, or the
 * cleaner has already started/finished the turnover (the date they began with
 * is the contract — a moved checkout on an in-progress job is not silently
 * re-pointed). Best-effort; callers wrap it so it never throws into the webhook.
 */
export async function reconcileTaskOnModify(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: { bookingRowId: string; propertyId: string; newCheckOut: string },
): Promise<{ updated: boolean }> {
  const { bookingRowId, propertyId, newCheckOut } = args;
  const { data: taskRows } = await supabase
    .from("cleaning_tasks")
    .select("id, scheduled_date, cleaner_id, cleaner_token, status")
    .eq("booking_id", bookingRowId)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task = ((taskRows ?? []) as any[])[0];
  if (!task) return { updated: false };
  if (task.status === "in_progress" || task.status === "completed") return { updated: false };
  if (task.scheduled_date === newCheckOut) return { updated: false };

  const nextBookingId = await resolveNextBookingId(supabase, propertyId, newCheckOut);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("cleaning_tasks") as any)
    .update({ scheduled_date: newCheckOut, next_booking_id: nextBookingId })
    .eq("id", task.id);

  // Re-dispatch if already assigned — the cleaner was pushed the old date.
  if (task.cleaner_id) {
    try {
      const { sendAssignmentPush } = await import("@/lib/push/send");
      const { data: propRows } = await supabase
        .from("properties").select("name").eq("id", propertyId).limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propName: string = ((propRows ?? []) as any[])[0]?.name ?? "Property";
      await sendAssignmentPush(supabase, {
        cleanerId: task.cleaner_id,
        url: `/clean/${task.id}/${task.cleaner_token}`,
        title: "Cleaning job rescheduled",
        body: `${propName} · now ${formatDateLabel(newCheckOut)}`,
      });
    } catch (err) {
      console.error("[turnover/auto-create] reschedule push failed:", err);
    }
  }
  return { updated: true };
}

/**
 * P1.1 — booking-cancellation teardown.
 *
 * A cancelled booking leaves an orphaned turnover on a now-guestless date.
 * For an UNSTARTED task (pending|assigned): notify the assigned cleaner the
 * job is off, then hard-delete the task — its cleaner_token deep link dies
 * with it, and a re-instated booking re-creates the task via createCleaningTask.
 * An already-started task (in_progress|completed|issue) is left intact: the
 * cleaner did real work and we don't silently erase it. Best-effort; callers
 * wrap it so it never throws into the webhook.
 */
export async function teardownTaskOnCancel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: { bookingRowId: string },
): Promise<{ deleted: boolean }> {
  const { bookingRowId } = args;
  const { data: taskRows } = await supabase
    .from("cleaning_tasks")
    .select("id, property_id, scheduled_date, cleaner_id, cleaner_token, status")
    .eq("booking_id", bookingRowId)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task = ((taskRows ?? []) as any[])[0];
  if (!task) return { deleted: false };
  if (task.status !== "pending" && task.status !== "assigned") return { deleted: false };

  // Notify the assigned cleaner BEFORE deleting (the deep link 404s after the
  // delete, which is honest — the job is gone — but the title carries the news).
  if (task.cleaner_id) {
    try {
      const { sendAssignmentPush } = await import("@/lib/push/send");
      const { data: propRows } = await supabase
        .from("properties").select("name").eq("id", task.property_id).limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propName: string = ((propRows ?? []) as any[])[0]?.name ?? "Property";
      await sendAssignmentPush(supabase, {
        cleanerId: task.cleaner_id,
        url: `/clean/${task.id}/${task.cleaner_token}`,
        title: "Cleaning job cancelled",
        body: `${propName} · ${formatDateLabel(task.scheduled_date)} — booking cancelled`,
      });
    } catch (err) {
      console.error("[turnover/auto-create] cancel push failed:", err);
    }
  }

  await supabase.from("cleaning_tasks").delete().eq("id", task.id);
  return { deleted: true };
}

export { DEFAULT_CHECKLIST };
