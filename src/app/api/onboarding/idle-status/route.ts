/**
 * GET /api/onboarding/idle-status — M8 C3 (D11 idle re-engagement).
 *
 * Returns the host's chat-idle state so the chat surface can surface a
 * lazy soft re-engagement banner once 24h has passed since the last
 * agent_turn, and silently mark onboarding complete once 48h has
 * passed without return.
 *
 * Response 200:
 *   {
 *     hours_since_last_turn: number | null,
 *     should_reengage: boolean,
 *     should_silent_complete: boolean,
 *     reengagement_cooldown_active: boolean
 *   }
 *
 * Auth: createClient + getUser. host_id from session.
 *
 * Side effect: when should_silent_complete fires, writes the
 * `onboarding_marked_complete_at` memory_fact. Pure GET semantics
 * preserved for the reengage path — banner click is the host action,
 * which triggers a separate POST on send (handled in ChatClient).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  readOnboardingFact,
  writeOnboardingFact,
} from "@/lib/agent/onboarding-state";
import { classifySufficiency } from "@/lib/agent/sufficiency";

const REENGAGE_HOURS = 24;
const SILENT_COMPLETE_HOURS = 48;
const REENGAGE_COOLDOWN_HOURS = 24 * 7;

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

    const { data: lastTurn, error: turnErr } = await supabase
      .from("agent_turns")
      .select("created_at, agent_conversations!inner(host_id)")
      .eq("agent_conversations.host_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (turnErr) {
      return NextResponse.json(
        { error: `agent_turns lookup failed: ${turnErr.message}` },
        { status: 500 },
      );
    }

    if (!lastTurn?.created_at) {
      return NextResponse.json({
        hours_since_last_turn: null,
        should_reengage: false,
        should_silent_complete: false,
        reengagement_cooldown_active: false,
      });
    }

    const ageMs = Date.now() - new Date(lastTurn.created_at as string).getTime();
    const hours = ageMs / (60 * 60 * 1000);

    // Skip the heavier lookups when the host is well within active window.
    if (hours < REENGAGE_HOURS) {
      return NextResponse.json({
        hours_since_last_turn: hours,
        should_reengage: false,
        should_silent_complete: false,
        reengagement_cooldown_active: false,
      });
    }

    const [classification, reengagedAt, markedCompleteAt] = await Promise.all([
      classifySufficiency(supabase, user.id),
      readOnboardingFact(supabase, user.id, "onboarding_idle_reengaged_at"),
      readOnboardingFact(supabase, user.id, "onboarding_marked_complete_at"),
    ]);

    // Already silently completed → never re-engage; surface terminal state.
    if (markedCompleteAt) {
      return NextResponse.json({
        hours_since_last_turn: hours,
        should_reengage: false,
        should_silent_complete: false,
        reengagement_cooldown_active: false,
      });
    }

    // 48h+ idle with non-rich sufficiency → silently complete.
    if (hours >= SILENT_COMPLETE_HOURS && classification.level !== "rich") {
      await writeOnboardingFact(
        supabase,
        user.id,
        "onboarding_marked_complete_at",
        new Date().toISOString(),
      );
      return NextResponse.json({
        hours_since_last_turn: hours,
        should_reengage: false,
        should_silent_complete: true,
        reengagement_cooldown_active: false,
      });
    }

    // 7-day cooldown after the last re-engagement.
    if (reengagedAt) {
      const cooldownAgeHours =
        (Date.now() - new Date(reengagedAt).getTime()) / (60 * 60 * 1000);
      if (cooldownAgeHours < REENGAGE_COOLDOWN_HOURS) {
        return NextResponse.json({
          hours_since_last_turn: hours,
          should_reengage: false,
          should_silent_complete: false,
          reengagement_cooldown_active: true,
        });
      }
    }

    // Re-engage window: 24h ≤ hours < 48h, not previously cooled-down,
    // sufficiency not rich (rich hosts don't need re-engagement).
    const shouldReengage =
      hours >= REENGAGE_HOURS && classification.level !== "rich";

    if (shouldReengage) {
      // Side-effect-on-GET: start the 7-day cooldown immediately so a
      // refresh in the same window doesn't re-fire the banner. Honest
      // pragmatic call — single one-shot marker; cleaner separation
      // (split into POST ack) deferred as M9 polish if endpoint
      // semantics drift becomes a concern.
      await writeOnboardingFact(
        supabase,
        user.id,
        "onboarding_idle_reengaged_at",
        new Date().toISOString(),
      );
    }

    return NextResponse.json({
      hours_since_last_turn: hours,
      should_reengage: shouldReengage,
      should_silent_complete: false,
      reengagement_cooldown_active: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
