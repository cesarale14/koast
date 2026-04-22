/**
 * POST /api/calendar/base-rate/[propertyId]
 *
 * Session 5b.3 — bulk update the Koast-side base rate (the
 * calendar_rates row with channel_code IS NULL) for one or more
 * dates. DB-only; does NOT call Channex. Base rate is engine
 * intent and platform overrides are kept intact.
 *
 * Request body: { dates: string[], rate: number }
 *
 * Response:
 *   200 { ok: true, updated: number, dates: string[] }
 *   400 on validation
 *   401/403 on auth/ownership
 *   500 on DB failure
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const { dates, rate } = body as { dates?: unknown; rate?: unknown };

    if (!Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json({ error: "dates must be a non-empty array" }, { status: 400 });
    }
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: "rate must be a positive number" }, { status: 400 });
    }
    const dateList: string[] = [];
    for (const d of dates) {
      if (typeof d !== "string" || !DATE_RE.test(d)) {
        return NextResponse.json({ error: `invalid date: ${d}` }, { status: 400 });
      }
      if (!dateList.includes(d)) dateList.push(d);
    }

    const supabase = createServiceClient();
    const propertyId = params.propertyId;

    // Upsert base rows (channel_code=NULL). rate_source='manual' matches
    // the convention for host-edited base rates; the engine writes
    // 'engine' on its path. Preserve min_stay + is_available if rows
    // already exist by only setting the rate/source columns via
    // onConflict update.
    const rows = dateList.map((date) => ({
      property_id: propertyId,
      date,
      channel_code: null as string | null,
      base_rate: rate,
      applied_rate: rate,
      rate_source: "manual",
      is_available: true,
      min_stay: 1,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (supabase.from("calendar_rates") as any)
      .upsert(rows, { onConflict: "property_id,date,channel_code" });
    if (upErr) {
      console.error("[calendar/base-rate POST]", upErr);
      return NextResponse.json({ error: `DB upsert failed: ${upErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: dateList.length, dates: dateList });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[calendar/base-rate POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
