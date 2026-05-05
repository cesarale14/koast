/**
 * propose_guest_message — M7 D38 + D46 + D47.
 *
 * The first non-memory gated action. Proposes a guest reply for the
 * host to review; on approval the post-approval handler at
 * `src/lib/action-substrate/handlers/propose-guest-message.ts` calls
 * Channex `sendMessage` to deliver via the OTA → guest.
 *
 * Mirrors M6's write-memory-fact.ts pattern:
 *   - requiresGate: true, stakesClass: 'medium' — substrate returns
 *     mode='require_confirmation' and the D35 dispatcher fork writes
 *     the agent_artifacts row + invokes buildProposalOutput.
 *   - The tool's `handler` is unreached at proposal time; a guard
 *     throws so any drift is caught loudly.
 *   - artifactKind: 'guest_message_proposal' — used by the chat shell
 *     and by /api/agent/artifact's approve dispatcher.
 *
 * M7-specific:
 *   - editable: true (D38) — UI surfaces an Edit button alongside
 *     Approve/Discard. Pure UI hint; the dispatcher does not branch.
 *   - No supersedes (D47) — guest messages are independent sends; each
 *     proposal stands alone. Future tools may revisit.
 *   - One message per artifact (D46) — multi-message drafting is a
 *     carry-forward.
 */

import { z } from "zod";
import type { Tool } from "../types";

// ---------- Input schema ----------

const ProposeGuestMessageInputSchema = z.object({
  /** Booking the message is being sent on. read_guest_thread already returned this. */
  booking_id: z.string().uuid(),
  /**
   * The drafted message text. Channex's underlying OTA limits vary
   * (Booking.com ~1000 chars, Airbnb more permissive); 5000 is a
   * generous upper bound that catches obvious drift while letting
   * the channel-specific failure surface from Channex if exceeded.
   */
  message_text: z.string().min(1).max(5000),
});

// ---------- Output schema (proposal-time, D35 fork) ----------

const ProposeGuestMessageProposalOutputSchema = z.object({
  artifact_id: z.string().uuid(),
  audit_log_id: z.string().uuid(),
  outcome: z.literal("pending"),
  message: z.string(),
});

type ProposeGuestMessageInput = z.infer<typeof ProposeGuestMessageInputSchema>;
type ProposeGuestMessageProposalOutput = z.infer<typeof ProposeGuestMessageProposalOutputSchema>;

// ---------- Description (model-facing) ----------

const DESCRIPTION = `Propose a guest message draft for host review. The host sees a card with the drafted text and three options: Approve (Koast sends via Channex → OTA → guest), Edit (modify the text inline, then Approve), Discard (rejected — no send).

Guest messages only go out after the host approves — never call this tool to "send"; the proposal IS the send-once-approved.

Always call read_guest_thread FIRST for the same booking_id. The thread context tells you:
  - the channel (airbnb / booking_com / vrbo / direct) — calibrate tone per OTA convention:
      * airbnb: friendly, conversational; first name; emoji acceptable but sparing
      * booking_com: more formal; first name; avoid emoji; aim under 1000 chars
      * vrbo: warm/family-oriented; between airbnb and booking_com in formality
      * direct: friendly-professional default; check thread history for the host's voice
  - what the guest already said (don't repeat questions, don't contradict prior commitments)
  - what the host has already promised in this thread

When NOT to call:
  - You don't have thread context yet — call read_guest_thread first
  - The guest hasn't asked anything actionable; an unprompted message is rarely the right move
  - You'd be impersonating the guest or replying to a system notification
  - The host's prior thread voice is unclear and the request is ambiguous — ask the host conversationally first

Inputs:
  - booking_id (UUID): the booking the reply belongs to
  - message_text (1-5000 chars): the drafted reply, written in the host's voice and calibrated to the channel

Returns: artifact_id + audit_log_id + outcome='pending' + a short confirmation you can echo to the host ("I've drafted a reply — you can edit it before approving"). One message per proposal — if you need to draft a sequence, propose them one at a time.`;

// ---------- Tool ----------

export const proposeGuestMessageTool: Tool<
  ProposeGuestMessageInput,
  ProposeGuestMessageProposalOutput
> = {
  name: "propose_guest_message",
  description: DESCRIPTION,
  inputSchema: ProposeGuestMessageInputSchema,
  outputSchema: ProposeGuestMessageProposalOutputSchema,
  requiresGate: true,
  stakesClass: "medium",
  artifactKind: "guest_message_proposal",
  editable: true, // M7 D38 — host can Edit the draft before approving
  buildProposalOutput: (_input, _context, refs) => ({
    artifact_id: refs.artifact_id,
    audit_log_id: refs.audit_log_id,
    outcome: "pending",
    message:
      "Drafted — Koast has surfaced the message for the host. They can approve to send via the OTA, edit the text first, or discard the draft.",
  }),
  handler: async () => {
    // Unreached at proposal time. The dispatcher's D35 fork intercepts
    // when the substrate returns mode='require_confirmation' and writes
    // the agent_artifacts row directly; this handler would only run on
    // the substrate's bypass path (source='agent_artifact'), which is
    // M7's post-approval flow routed through the /api/agent/artifact
    // endpoint to the action handler at
    // src/lib/action-substrate/handlers/propose-guest-message.ts —
    // not through dispatcher.dispatchToolCall.
    throw new Error(
      "[tool:propose_guest_message] Handler should not run at proposal time; the D35 dispatcher fork bypasses it. Post-approval execution lives in action-substrate/handlers/propose-guest-message.ts.",
    );
  },
};
