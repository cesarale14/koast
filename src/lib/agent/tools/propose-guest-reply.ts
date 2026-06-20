/**
 * propose_guest_reply — P3.2. The agent's host-gated guest send on the PROPOSALS
 * lane (P2.3), superseding M7's gated-artifact propose_guest_message for new
 * drafts. It EXECUTES NOTHING: it resolves the booking server-side, runs the
 * voice judges at PROPOSE time, and calls createProposal(createdBy:'agent') —
 * landing a PENDING `send_guest_reply` proposals row + firing the bell. On
 * approval the send_guest_reply action runs proposeGuestMessageHandler — the
 * SAME M7 Channex send single-writer (no agent side-door).
 *
 * Non-gated (requiresGate:false): the proposal IS the gate. NEVER auto-approvable
 * (the action is flagged neverAutoApprove) — a guest-facing send always requires
 * explicit host approval.
 *
 * Voice enforcement at PROPOSE time (closes the load-bearing gap — these did NOT
 * run on the agent path under the old tool):
 *   - applyOutputJudges('host-to-guest', J1-J6): J1 (emoji) MUTATES the draft, so
 *     the STORED + SENT text is emoji-clean; J2-J6 ANNOTATE the envelope
 *     (advisory, never block — host approval is the gate, so fail-open-with-flag
 *     stays valid per the CLAUDE.md J3 contract). judge_results are persisted on
 *     the proposal payload for the (deferred) inline ProposalCard.
 *   - The publisher-category HARD-refusal (legal / regulatory / licensed-
 *     professional, M8 D18) is enforced at THREE loci (true defense-in-depth):
 *     the system prompt steers the model away; the loop pre-dispatch intercept
 *     (extended to this tool name) emits the F4 refusal_envelope before dispatch;
 *     and this handler itself re-runs classifyPublisherCategory as a failsafe so
 *     the refusal binds to the tool regardless of dispatch path. In normal flow
 *     the loop fires first and this handler is never reached for one.
 *
 * Pre-write read (D27): the system prompt requires read_guest_thread FIRST for
 * the same booking_id (channel calibration + prior-thread context). This tool
 * trusts that contract; it re-resolves channel + ownership server-side for the
 * display block + the safety check.
 */

import { z } from "zod";
import type { Tool } from "../types";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createProposal } from "@/lib/proposals/server";
import { applyOutputJudges } from "@/lib/agent/judge/apply-output-judges";
import { readVoiceMode } from "@/lib/memory/voice-mode";
import type { AgentTextOutput } from "@/lib/agent/schemas/agent-text-output";
import type { BlockData } from "@/lib/agent/render/blocks";
import {
  classifyPublisherCategory,
  detectLicensedProfessionalTerm,
} from "@/lib/agent/refusal-classifier";
import {
  envelopeForPublisherCategory,
  buildLicensedProfessionalRefusal,
} from "@/lib/agent/refusal-envelope";
import { canonicalChannel } from "./read-guest-thread";

const InputSchema = z.object({
  booking_id: z
    .string()
    .uuid()
    .describe(
      "The booking the reply belongs to (agent-internal id from read_guest_thread or the agenda). Always call read_guest_thread for this booking FIRST.",
    ),
  message_text: z
    .string()
    .min(1)
    .max(5000)
    .describe("The drafted reply, written in the host's voice and calibrated to the channel."),
  rationale: z
    .string()
    .min(1)
    .max(280)
    .describe("One short line on why you're proposing this reply — shown on the proposal card."),
});
type Input = z.infer<typeof InputSchema>;

const OutputSchema = z.object({
  created: z.boolean(),
  proposal_id: z.string().optional(),
  reason: z.string().optional(),
});
type Output = z.infer<typeof OutputSchema>;

const DESCRIPTION = `Propose a guest reply draft for host review. This does NOT send anything — it creates a suggestion the host approves on their home or the bell (Approve → Koast sends via Channex → OTA → guest; Dismiss → no send). Guest replies only go out after the host approves; never call this to "send" — the proposal IS the send-once-approved.

Always call read_guest_thread FIRST for the same booking_id. The thread context tells you:
  - the channel (airbnb / booking_com / vrbo / direct) — calibrate tone per OTA convention:
      * airbnb: friendly, conversational; first name; emoji acceptable but sparing
      * booking_com: more formal; first name; avoid emoji; aim under 1000 chars
      * vrbo: warm/family-oriented; between airbnb and booking_com in formality
      * direct: friendly-professional default; mirror the host's prior thread voice
  - what the guest already said (don't repeat questions, don't contradict prior commitments)
  - what the host has already promised in this thread

When NOT to call:
  - You don't have thread context yet — call read_guest_thread first.
  - The guest hasn't asked anything actionable; an unprompted message is rarely the right move.
  - You'd be impersonating the guest or replying to a system notification.
  - The host's prior thread voice is unclear and the request is ambiguous — ask the host conversationally first.
  - The request is publisher-category correspondence (M8 D18): legal correspondence, regulatory submissions, or substantive licensed-professional communication. Redirect in chat — you can help the host think it through or pull data they need, but won't author the outbound message.

One reply per proposal — if you need to draft a sequence, propose them one at a time.`;

export const proposeGuestReplyTool: Tool<Input, Output> = {
  name: "propose_guest_reply",
  description: DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  requiresGate: false,
  handler: async (input, context) => {
    const supabase = createServiceClient();
    const hostId = context.host.id;

    // 0. Publisher-category HARD-refusal failsafe (M8 D18) — travels WITH the
    //    tool, not only the loop pre-dispatch intercept. In normal flow the loop
    //    intercept fires first (emitting the F4 refusal_envelope) and this tool
    //    is never reached for a publisher-category draft; this is the
    //    defense-in-depth that binds the refusal to the tool itself, so any
    //    future dispatch path that reaches the handler still refuses. It is a
    //    categorical refusal (legal / regulatory / licensed-professional), not an
    //    advisory voice judge.
    const publisherCategory = classifyPublisherCategory(input.message_text);
    if (publisherCategory !== null) {
      const env =
        publisherCategory === "licensed_professional"
          ? buildLicensedProfessionalRefusal(detectLicensedProfessionalTerm(input.message_text))
          : envelopeForPublisherCategory(publisherCategory);
      return {
        created: false,
        reason: `${env.reason}${env.alternative_path ? ` ${env.alternative_path}` : ""}`,
      };
    }

    // 1. Resolve the booking → property (the booking id is agent-internal).
    const { data: bookingRows } = await supabase
      .from("bookings")
      .select("id, property_id, guest_name, platform")
      .eq("id", input.booking_id)
      .limit(1);
    const booking = ((bookingRows ?? []) as {
      id: string;
      property_id: string;
      guest_name: string | null;
      platform: string | null;
    }[])[0];
    if (!booking) {
      return { created: false, reason: "I couldn't find that booking — read_guest_thread first." };
    }

    // 2. Ownership (defense-in-depth — the service client bypasses RLS).
    const owned = await verifyPropertyOwnership(hostId, booking.property_id);
    if (!owned) {
      return { created: false, reason: "That booking isn't on one of your properties." };
    }

    // 3. Property name + channel for the id-lean display block. Channel prefers
    //    the most-recent thread's code, falling back to the booking platform —
    //    mirrors read_guest_thread.
    const { data: propRows } = await supabase
      .from("properties")
      .select("name")
      .eq("id", booking.property_id)
      .limit(1);
    const propertyName = ((propRows ?? []) as { name: string | null }[])[0]?.name ?? null;

    const { data: threadRows } = await supabase
      .from("message_threads")
      .select("channel_code, last_message_received_at")
      .eq("booking_id", input.booking_id)
      .order("last_message_received_at", { ascending: false, nullsFirst: false })
      .limit(1);
    const thread = ((threadRows ?? []) as {
      channel_code: string | null;
      last_message_received_at: string | null;
    }[])[0];
    const channel = canonicalChannel(thread?.channel_code ?? booking.platform);
    // P2b confidence (new_guest): first contact = no thread, or the guest hasn't
    // written yet (no received message) — matches the cue's "no past messages
    // from them yet" note. A soft honesty signal on the card, never a gate.
    const firstContact = !thread || thread.last_message_received_at == null;

    // 4. Voice judges at PROPOSE time. J1 (emoji) filters the draft text; J2-J6
    //    annotate the envelope. The FILTERED text is what's stored + sent.
    const voiceMode = await readVoiceMode(supabase, hostId);
    const baseEnvelope: AgentTextOutput = {
      content: input.message_text,
      confidence: "high_inference",
      source_attribution: [],
    };
    const { finalText, envelope } = await applyOutputJudges(
      input.message_text,
      "host-to-guest",
      voiceMode?.mode ?? "neutral",
      baseEnvelope,
    );

    // 5. Build the proposal: block (host-facing display) + action (execution) +
    //    judge_results (persisted for the deferred inline ProposalCard). Entity
    //    ids live ONLY in action — normalizeProposal strips them from the block.
    const block: BlockData = {
      kind: "guest_reply",
      data: {
        channel,
        guestName: booking.guest_name ?? null,
        propertyName,
        messageText: finalText,
        firstContact,
      },
    };

    const { proposal } = await createProposal(supabase, {
      hostId,
      propertyId: booking.property_id,
      actionType: "send_guest_reply",
      payload: {
        block,
        action: { bookingId: booking.id, messageText: finalText },
        judge_results: envelope.judge_results ?? [],
      },
      rationale: input.rationale,
      createdBy: "agent",
    });

    return { created: true, proposal_id: proposal.id };
  },
};
