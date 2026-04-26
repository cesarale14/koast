// TURN-S1a — POST /api/internal/booking-created
//
// Called by the Postgres trigger `bookings_fire_turnover_task` via
// pg_net's net.http_post(). NOT user-facing. Bearer-secret auth via
// the shared internal helper.
//
// Flow:
//   1. assertInternalAuth(request) → 401 on miss/mismatch.
//   2. zod-parse {booking_id, property_id, source} → 400 on shape miss.
//   3. Service-role client loads the booking row (404 if absent — the
//      trigger fired but the row was already deleted, race window).
//   4. Calls createCleaningTask from src/lib/turnover/auto-create.ts:18.
//      The helper is idempotent on booking_id (existing-row early
//      return + the migration 1 UNIQUE constraint catches concurrent
//      double-fires via 23505 → no-op success).
//   5. Returns {created, task_id, source}. created reflects whether
//      a NEW row was actually inserted vs the early-return path.
//
// Logs every 4xx/5xx with full context to stderr so Vercel's log
// surface becomes the natural-habitat debug channel for trigger
// failures (Amendment 3). net._http_response is secondary.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createCleaningTask } from "@/lib/turnover/auto-create";
import { assertInternalAuth, InternalAuthError } from "@/lib/auth/internal";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ValidatedBody { booking_id: string; property_id: string; source: string }

function validateBody(raw: unknown): { ok: true; data: ValidatedBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "expected object body" };
  const r = raw as Record<string, unknown>;
  if (typeof r.booking_id !== "string" || !UUID_RE.test(r.booking_id)) return { ok: false, error: "booking_id must be a uuid string" };
  if (typeof r.property_id !== "string" || !UUID_RE.test(r.property_id)) return { ok: false, error: "property_id must be a uuid string" };
  if (typeof r.source !== "string" || r.source.length < 1 || r.source.length > 50) return { ok: false, error: "source must be a 1..50 char string" };
  return { ok: true, data: { booking_id: r.booking_id, property_id: r.property_id, source: r.source } };
}

export async function POST(request: NextRequest) {
  let parsedBody: ValidatedBody | null = null;
  try {
    assertInternalAuth(request);

    const raw = await request.json().catch(() => null);
    const parsed = validateBody(raw);
    if (!parsed.ok) {
      console.error("[internal/booking-created] FAILED 400", { error: parsed.error });
      return NextResponse.json({ error: `bad payload: ${parsed.error}` }, { status: 400 });
    }
    parsedBody = parsed.data;

    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bRows } = await (supabase.from("bookings") as any)
      .select("id, property_id, check_out, status")
      .eq("id", parsedBody.booking_id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const booking = ((bRows as any[] | null) ?? [])[0];
    if (!booking) {
      console.error("[internal/booking-created] FAILED 404", {
        source: parsedBody.source,
        booking_id: parsedBody.booking_id,
      });
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const taskId = await createCleaningTask(supabase, {
      id: booking.id,
      property_id: booking.property_id,
      check_out: booking.check_out,
    });

    // createCleaningTask returns the task id whether new or existing.
    // Distinguish via the row's created_at (within ~5s = new). Cheap
    // confirmation; the route caller (the trigger) only logs the
    // boolean for ad-hoc debugging.
    let created = false;
    if (taskId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: tRows } = await (supabase.from("cleaning_tasks") as any)
        .select("created_at")
        .eq("id", taskId)
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tRow = ((tRows as any[] | null) ?? [])[0];
      if (tRow?.created_at) {
        created = Date.now() - new Date(tRow.created_at).getTime() < 10_000;
      }
    }

    console.log("[internal/booking-created]", {
      source: parsedBody.source,
      booking_id: parsedBody.booking_id,
      task_id: taskId,
      created,
    });

    return NextResponse.json({ created, task_id: taskId, source: parsedBody.source });
  } catch (err) {
    if (err instanceof InternalAuthError) {
      console.error("[internal/booking-created] FAILED 401", {
        source: parsedBody?.source,
        booking_id: parsedBody?.booking_id,
        error: err.message,
      });
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[internal/booking-created] FAILED 500", {
      source: parsedBody?.source,
      booking_id: parsedBody?.booking_id,
      error: msg,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
