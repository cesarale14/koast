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

/**
 * Resolve a host reference to exactly one row, preferring an exact (case-
 * insensitive) name match before a substring match — so "Karem" picks "Karem"
 * over "Karembu" when both exist. ambiguous=true when >1 match at the chosen
 * tier; no match → undefined.
 */
function pickOne<T extends { name: string | null }>(
  rows: T[],
  query: string,
): { match?: T; ambiguous?: boolean } {
  const q = ci(query);
  const exact = rows.filter((r) => (r.name ?? "").trim().toLowerCase() === q);
  if (exact.length === 1) return { match: exact[0] };
  if (exact.length > 1) return { ambiguous: true };
  const sub = rows.filter((r) => (r.name ?? "").toLowerCase().includes(q));
  if (sub.length === 1) return { match: sub[0] };
  if (sub.length > 1) return { ambiguous: true };
  return {};
}

/** Local calendar date (YYYY-MM-DD) in the given timezone (ET default). */
function localDate(tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
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
      .select("id, name, timezone")
      .eq("user_id", hostId);
    const propPick = pickOne(
      (propRows ?? []) as { id: string; name: string | null; timezone: string | null }[],
      input.property,
    );
    if (propPick.ambiguous)
      return { created: false, reason: `"${input.property}" matches more than one property — which one?` };
    if (!propPick.match) return { created: false, reason: `No property matches "${input.property}".` };
    const property = propPick.match;

    // Resolve cleaner (host-owned, active; exact-name preferred).
    const { data: cleanerRows } = await supabase
      .from("cleaners")
      .select("id, name")
      .eq("user_id", hostId)
      .eq("is_active", true);
    const cleanerPick = pickOne(
      (cleanerRows ?? []) as { id: string; name: string | null }[],
      input.cleaner,
    );
    if (cleanerPick.ambiguous)
      return { created: false, reason: `"${input.cleaner}" matches more than one cleaner — which one?` };
    if (!cleanerPick.match) return { created: false, reason: `No active cleaner matches "${input.cleaner}".` };
    const cleaner = cleanerPick.match;

    // Resolve the turnover task: assignable (pending|assigned) for this property,
    // the given date or the SOONEST UPCOMING (>= today; never a past turnover).
    let taskQuery = supabase
      .from("cleaning_tasks")
      .select("id, scheduled_date, status")
      .eq("property_id", property.id)
      .in("status", ["pending", "assigned"])
      .order("scheduled_date", { ascending: true });
    taskQuery = input.date
      ? taskQuery.eq("scheduled_date", input.date)
      : taskQuery.gte("scheduled_date", localDate(property.timezone));
    const { data: taskRows } = await taskQuery.limit(1);
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
