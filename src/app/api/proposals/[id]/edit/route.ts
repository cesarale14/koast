/**
 * POST /api/proposals/[id]/edit (P6.5) — host edits a pending send_guest_reply
 * draft before approving. The EDITED text becomes what will send: it re-runs the
 * host-to-guest voice judges (J1 emoji-filters; J2-J6 annotate) so the stored +
 * sent text stays voice-clean, updates the proposal payload (action.messageText +
 * block.data.messageText + judge_results), and audit-logs the edit (original +
 * final). Only pending send_guest_reply proposals owned by the caller are editable;
 * an unchanged draft is a no-op edit (still re-judged, harmless).
 *
 * Body: { messageText: string }
 * Returns: { ok: true, proposal: NormalizedProposal }
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getProposalById, normalizeProposal } from "@/lib/proposals/server";
import { applyOutputJudges } from "@/lib/agent/judge/apply-output-judges";
import { readVoiceMode } from "@/lib/memory/voice-mode";
import { writeAuditLog } from "@/lib/action-substrate/audit-writer";
import { applyGuestReplyEdit } from "@/lib/proposals/edit-payload";
import type { AgentTextOutput } from "@/lib/agent/schemas/agent-text-output";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const messageText: string | undefined = body?.messageText;
    if (!messageText || typeof messageText !== "string" || messageText.trim().length === 0) {
      return NextResponse.json({ error: "messageText required" }, { status: 400 });
    }
    if (messageText.length > 5000) {
      return NextResponse.json({ error: "messageText too long (max 5000)" }, { status: 400 });
    }

    const svc = createServiceClient();
    const proposal = await getProposalById(svc, params.id);
    if (!proposal || proposal.host_id !== user.id) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }
    if (proposal.action_type !== "send_guest_reply") {
      return NextResponse.json({ error: "Only guest-reply drafts are editable" }, { status: 400 });
    }
    if (proposal.status !== "pending") {
      return NextResponse.json({ error: `Proposal already ${proposal.status}` }, { status: 409 });
    }

    // Re-run the host-to-guest voice judges on the edited text. J1 (emoji) MUTATES
    // → finalText is what we store + (on approve) send; J2-J6 annotate the envelope.
    const voiceMode = await readVoiceMode(svc, user.id);
    const baseEnvelope: AgentTextOutput = {
      content: messageText,
      confidence: "high_inference",
      source_attribution: [],
    };
    const { finalText, envelope } = await applyOutputJudges(
      messageText,
      "host-to-guest",
      voiceMode?.mode ?? "neutral",
      baseEnvelope,
    );

    // Merge the edit into the payload (block + action both carry the text;
    // entity ids in `action` are preserved untouched) + attach fresh judges.
    const { nextPayload: merged, originalText } = applyGuestReplyEdit(proposal.payload, finalText);
    const nextPayload = { ...merged, judge_results: envelope.judge_results ?? [] };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedRows } = await (svc.from("proposals") as any)
      .update({ payload: nextPayload })
      .eq("id", proposal.id)
      .eq("host_id", user.id)
      .eq("status", "pending") // don't edit a row that was decided meanwhile
      .select();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = ((updatedRows ?? []) as any[])[0];
    if (!updated) {
      return NextResponse.json({ error: "Proposal was decided before the edit landed" }, { status: 409 });
    }

    // Audit the edit — original vs final, attributed host/confirmed.
    try {
      await writeAuditLog({
        host_id: user.id,
        action_type: "send_guest_reply_edit",
        payload: { messageText: finalText },
        source: "frontend_api",
        actor_kind: "host",
        actor_id: user.id,
        autonomy_level: "confirmed",
        outcome: "succeeded",
        context: { proposal_id: proposal.id, original_text: originalText, final_text: finalText },
        stakes_class: "low",
        latency_ms: 0,
      });
    } catch (err) {
      console.warn("[proposals/edit] audit write failed:", err);
    }

    return NextResponse.json({ ok: true, proposal: normalizeProposal(updated) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
