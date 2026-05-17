/**
 * /api/onboarding/idle-status — M8 C3 (D11 idle re-engagement) +
 * M9 Phase G E1 split (HTTP-semantic discipline).
 *
 * Two methods:
 *   GET  — pure read. Returns the host's idle-state assessment so the
 *          chat surface (ReengagementBanner) can decide whether to
 *          surface the soft re-engagement banner. NO side effects.
 *   POST — ack + writes. Called by the client immediately after a GET
 *          that returned should_reengage=true OR should_silent_complete=true.
 *          Server re-fetches state (does NOT trust client claims) and
 *          performs the eligible writes:
 *            - silent-complete: writeOnboardingFact("onboarding_marked_complete_at", now)
 *            - reengage: writeOnboardingFact("onboarding_idle_reengaged_at", now)
 *          Returns 200 { acked: true, written: [...] }.
 *
 * Pre-split history: GET handler held both writes inline as a side-effect-on-GET
 * pattern (see M8 Phase G mark-seen route doc comment citing this as the
 * anti-pattern reference). M9 Phase G E1 closes that compromise.
 *
 * Idempotency: POST re-fetches state server-side and explicit early-returns
 * if onboarding is already marked complete. writeOnboardingFact upserts;
 * re-calling with the same fact is a supersession no-op.
 *
 * Auth: createClient + getUser. host_id from session.
 *
 * GET response 200:
 *   {
 *     hours_since_last_turn: number | null,
 *     should_reengage: boolean,
 *     should_silent_complete: boolean,
 *     reengagement_cooldown_active: boolean
 *   }
 *   Cache-Control: no-store (per-host stateful response)
 *
 * POST response 200:
 *   { acked: true, written: ("marked_complete" | "reengaged")[] }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { writeOnboardingFact } from "@/lib/agent/onboarding-state";
import { computeIdleStatus } from "@/lib/onboarding/idle-status";

export async function GET() {
  try {
    const supabaseSession = createClient();
    const {
      data: { user },
    } = await supabaseSession.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const supabase = createServiceClient();

    const state = await computeIdleStatus(supabase, user.id);
    return NextResponse.json(
      {
        hours_since_last_turn: state.hours_since_last_turn,
        should_reengage: state.should_reengage,
        should_silent_complete: state.should_silent_complete,
        reengagement_cooldown_active: state.reengagement_cooldown_active,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabaseSession = createClient();
    const {
      data: { user },
    } = await supabaseSession.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const supabase = createServiceClient();

    const state = await computeIdleStatus(supabase, user.id);

    // R-E1.2: explicit early-return when already marked complete. The
    // helper returns markedCompleteAt on that path; we never enter a
    // write branch for an already-completed host.
    if (state.markedCompleteAt) {
      return NextResponse.json({ acked: true, written: [] });
    }

    const written: Array<"marked_complete" | "reengaged"> = [];
    const now = new Date().toISOString();

    if (state.should_silent_complete) {
      await writeOnboardingFact(
        supabase,
        user.id,
        "onboarding_marked_complete_at",
        now,
      );
      written.push("marked_complete");
    }

    if (state.should_reengage && !state.reengagement_cooldown_active) {
      await writeOnboardingFact(
        supabase,
        user.id,
        "onboarding_idle_reengaged_at",
        now,
      );
      written.push("reengaged");
    }

    return NextResponse.json({ acked: true, written });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
