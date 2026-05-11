/**
 * POST /api/audit-feed/mark-seen — M8 Phase G C4 (D16 + D17d).
 *
 * Upserts the host's host_state.last_seen_inspect_at to now(). Called
 * by ChatClient when the AuditDrawer opens; clears the unread badge.
 *
 * Per C4 sign-off R-9: clean POST separation (no side-effect-on-GET
 * pattern like /api/onboarding/idle-status' shortcut from Phase F).
 * The drawer-open call is a write; the endpoint is the write surface.
 *
 * Auth: createClient + getUser. host_id derived from session.
 *
 * Response 200:
 *   { last_seen_inspect_at: string }   // ISO8601 timestamp just set
 *
 * Response 401: unauthenticated
 * Response 500: upsert failed
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const now = new Date().toISOString();
    const { error: upsertErr } = await supabase
      .from("host_state")
      .upsert(
        {
          host_id: user.id,
          last_seen_inspect_at: now,
        },
        { onConflict: "host_id" },
      );
    if (upsertErr) {
      return NextResponse.json(
        { error: `host_state upsert failed: ${upsertErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ last_seen_inspect_at: now });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
