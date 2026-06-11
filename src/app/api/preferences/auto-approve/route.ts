/**
 * GET  /api/preferences/auto-approve — the per-action-type auto-approve toggles
 *      (label + current value + whether disabled because OTA is off).
 * PUT  /api/preferences/auto-approve — set ONE toggle { actionType, enabled }.
 *
 * Auto-approve is stored at user_preferences.preferences.auto_approve (a map
 * action_type → bool). ALL default OFF. An OTA-touching action cannot be
 * enabled while OTA writes are disabled (defense beyond the hidden toggle).
 * PUT does a read-merge-write so it never clobbers the notification prefs.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PREFS } from "@/lib/settings/default-prefs";
import {
  getProposalActionDef,
  getProposalActionMeta,
  isOtaWriteEnabled,
} from "@/lib/proposals/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readPrefs(supabase: any, userId: string): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from("user_preferences")
    .select("preferences")
    .eq("user_id", userId)
    .single();
  return (data?.preferences as Record<string, unknown>) ?? {};
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prefs = await readPrefs(supabase, user.id);
  const map = (prefs.auto_approve as Record<string, unknown>) ?? {};
  const ota = isOtaWriteEnabled();

  const items = getProposalActionMeta().map((m) => ({
    actionType: m.actionType,
    label: m.label,
    description: m.description,
    otaTouching: m.otaTouching,
    enabled: map[m.actionType] === true,
    // OTA-touching toggles are disabled (and hidden in the UI) while OTA is off.
    disabled: m.otaTouching && !ota,
  }));

  return NextResponse.json({ items, otaEnabled: ota });
}

export async function PUT(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { actionType, enabled } = (body ?? {}) as { actionType?: string; enabled?: boolean };
  if (!actionType || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "actionType and enabled (boolean) are required" }, { status: 400 });
  }
  const def = getProposalActionDef(actionType);
  if (!def) {
    return NextResponse.json({ error: `Unknown action_type '${actionType}'` }, { status: 400 });
  }
  // Never-auto-approvable actions (e.g. send_guest_reply — a guest-facing send)
  // refuse the toggle at the write boundary too, symmetric with getProposalActionMeta
  // omitting them from the GET. isAutoApproveEnabled already ignores any persisted
  // value for these, so this just prevents a confusing persisted-but-inert pref.
  if (enabled && def.neverAutoApprove) {
    return NextResponse.json(
      { error: `'${actionType}' can never be auto-approved.` },
      { status: 400 },
    );
  }
  if (enabled && def.otaTouching && !isOtaWriteEnabled()) {
    return NextResponse.json(
      { error: "Can't auto-approve an OTA action while OTA writes are disabled." },
      { status: 400 },
    );
  }

  // Read-merge-write so notification prefs are preserved.
  const prefs = await readPrefs(supabase, user.id);
  const map = { ...((prefs.auto_approve as Record<string, unknown>) ?? {}), [actionType]: enabled };
  const updated = { ...DEFAULT_PREFS, ...prefs, auto_approve: map };

  const { error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: user.id, preferences: updated }, { onConflict: "user_id" });
  if (error) {
    console.error("[auto-approve] upsert error:", error.message);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ autoApprove: map });
}
