/**
 * propose_assign_cleaner — P3.2, the agent's first WRITE-as-proposal. The agent
 * proposes assigning a cleaner to a turnover; it EXECUTES NOTHING. The handler
 * resolves the host's references (property + cleaner names, optional date) into
 * the entity ids SERVER-SIDE — the model never handles ids (read blocks are
 * id-lean) — and calls createProposal(createdBy:'agent'), which lands a PENDING
 * proposals row and fires the bell. The host approves on Today / the bell /
 * inline chat, and Approve executes through assignCleaner — the SAME single-
 * writer the manual UI uses (no agent side-door). All auto-approve defaults are
 * off, so the common path is always pending.
 *
 * Non-gated (requiresGate:false): the proposal IS the side effect; host approval
 * is the gate (at /api/proposals/[id]/approve), not the tool call.
 */

import { z } from "zod";
import type { Tool } from "../types";
import { createServiceClient } from "@/lib/supabase/service";
import { createProposal, buildAssignCleanerProposalPayload } from "@/lib/proposals/server";

const InputSchema = z.object({
  property: z.string().min(1).describe("The property name the host referenced (e.g. 'Villa Jamaica')."),
  cleaner: z.string().min(1).describe("The cleaner's name the host referenced (e.g. 'Karem')."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("The turnover date (YYYY-MM-DD). Omit to target the soonest assignable turnover for the property."),
  rationale: z.string().min(1).max(280).describe("One short line on why — shown on the proposal card."),
});
type Input = z.infer<typeof InputSchema>;

const OutputSchema = z.object({
  created: z.boolean(),
  proposal_id: z.string().optional(),
  /** When created=false: why it couldn't be proposed (for the model to relay/ask). */
  reason: z.string().optional(),
});
type Output = z.infer<typeof OutputSchema>;

const DESCRIPTION = `Propose assigning a cleaner to a turnover. This does NOT assign anyone — it creates a suggestion the host approves (Approve dispatches the cleaner; Dismiss does nothing).

Call this ONLY when the host gives an explicit instruction to assign a cleaner — an imperative like "assign Karem to the Villa tomorrow", "have Maria clean Cozy Loft Friday". One proposal per instruction. Resolve the property, cleaner, and date from the host's message and the turnover context you've read.

If you can't unambiguously identify the property, the cleaner, or which turnover (e.g. the name matches two cleaners, or there's no upcoming turnover for that property) do NOT guess — the tool returns created:false with a reason; relay it and ask the host to clarify.`;

function ci(s: string): string {
  return s.trim().toLowerCase();
}

export const proposeAssignCleanerTool: Tool<Input, Output> = {
  name: "propose_assign_cleaner",
  description: DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  requiresGate: false,
  handler: async (input, context) => {
    const supabase = createServiceClient();
    const hostId = context.host.id;

    // Resolve property (host-owned; case-insensitive substring; exactly one).
    const { data: propRows } = await supabase
      .from("properties")
      .select("id, name")
      .eq("user_id", hostId);
    const props = ((propRows ?? []) as { id: string; name: string | null }[]).filter((p) =>
      (p.name ?? "").toLowerCase().includes(ci(input.property)),
    );
    if (props.length === 0) return { created: false, reason: `No property matches "${input.property}".` };
    if (props.length > 1)
      return { created: false, reason: `"${input.property}" matches more than one property — which one?` };
    const property = props[0];

    // Resolve cleaner (host-owned, active; exactly one).
    const { data: cleanerRows } = await supabase
      .from("cleaners")
      .select("id, name")
      .eq("user_id", hostId)
      .eq("is_active", true);
    const cleaners = ((cleanerRows ?? []) as { id: string; name: string | null }[]).filter((c) =>
      (c.name ?? "").toLowerCase().includes(ci(input.cleaner)),
    );
    if (cleaners.length === 0) return { created: false, reason: `No active cleaner matches "${input.cleaner}".` };
    if (cleaners.length > 1)
      return { created: false, reason: `"${input.cleaner}" matches more than one cleaner — which one?` };
    const cleaner = cleaners[0];

    // Resolve the turnover task: assignable (pending|assigned) for this property,
    // the given date or the soonest upcoming.
    let taskQuery = supabase
      .from("cleaning_tasks")
      .select("id, scheduled_date, status")
      .eq("property_id", property.id)
      .in("status", ["pending", "assigned"])
      .order("scheduled_date", { ascending: true });
    if (input.date) taskQuery = taskQuery.eq("scheduled_date", input.date);
    const { data: taskRows } = await taskQuery.limit(5);
    const tasks = (taskRows ?? []) as { id: string; scheduled_date: string; status: string }[];
    if (tasks.length === 0) {
      return {
        created: false,
        reason: input.date
          ? `No assignable turnover at ${property.name} on ${input.date}.`
          : `No upcoming assignable turnover at ${property.name}.`,
      };
    }
    const task = tasks[0];

    const payload = buildAssignCleanerProposalPayload({
      taskId: task.id,
      cleanerId: cleaner.id,
      property: property.name ?? "Property",
      date: task.scheduled_date,
      cleanerName: cleaner.name ?? "Cleaner",
    });

    const { proposal } = await createProposal(supabase, {
      hostId,
      propertyId: property.id,
      actionType: "assign_cleaner",
      payload,
      rationale: input.rationale,
      createdBy: "agent",
    });

    return { created: true, proposal_id: proposal.id };
  },
};
