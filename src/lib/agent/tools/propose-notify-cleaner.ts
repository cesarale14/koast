/**
 * propose_notify_cleaner — P3.2. The agent proposes RE-NOTIFYING the cleaner
 * already assigned to a turnover (re-fires the job push). It EXECUTES NOTHING:
 * it resolves the host's references SERVER-SIDE into the task id and calls
 * createProposal(createdBy:'agent'), landing a PENDING proposals row + firing
 * the bell. On approval the notify_cleaner action runs notifyCleaner — the SAME
 * single writer the manual "Notify" button uses (no agent side-door).
 *
 * Distinct from propose_assign_cleaner: that ASSIGNS a cleaner to an unstaffed
 * turnover; this RE-NOTIFIES the cleaner already on a staffed one. So it targets
 * a turnover that is already 'assigned' (has a cleaner) — if none is assigned,
 * it returns created:false (assign first).
 *
 * Non-gated (requiresGate:false): the proposal IS the side effect; host approval
 * is the gate.
 */

import { z } from "zod";
import type { Tool } from "../types";
import { createServiceClient } from "@/lib/supabase/service";
import { createProposal } from "@/lib/proposals/server";
import type { BlockData } from "@/lib/agent/render/blocks";

const InputSchema = z.object({
  property: z.string().min(1).describe("The property name the host referenced (e.g. 'Villa Jamaica')."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("The turnover date (YYYY-MM-DD). Omit to target the soonest upcoming staffed turnover for the property."),
  rationale: z.string().min(1).max(280).describe("One short line on why — shown on the proposal card."),
});
type Input = z.infer<typeof InputSchema>;

const OutputSchema = z.object({
  created: z.boolean(),
  proposal_id: z.string().optional(),
  reason: z.string().optional(),
});
type Output = z.infer<typeof OutputSchema>;

const DESCRIPTION = `Propose re-notifying the cleaner ALREADY ASSIGNED to a turnover (re-sends the job notification). This does NOT notify anyone — it creates a suggestion the host approves (Approve re-sends the push; Dismiss does nothing).

Call this ONLY on an explicit instruction to remind/re-notify a cleaner — "remind the cleaner for the Villa tomorrow", "ping whoever's cleaning Cozy Loft Friday". One proposal per instruction. The turnover must already have a cleaner assigned — if it doesn't, the tool returns created:false; relay it (the host needs to assign someone first, via propose_assign_cleaner).`;

function ci(s: string): string {
  return s.trim().toLowerCase();
}

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

export const proposeNotifyCleanerTool: Tool<Input, Output> = {
  name: "propose_notify_cleaner",
  description: DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  requiresGate: false,
  handler: async (input, context) => {
    const supabase = createServiceClient();
    const hostId = context.host.id;

    // Resolve property (host-owned; exact CI match preferred over substring).
    const { data: propRows } = await supabase
      .from("properties")
      .select("id, name, timezone")
      .eq("user_id", hostId);
    const props = (propRows ?? []) as { id: string; name: string | null; timezone: string | null }[];
    const q = ci(input.property);
    const exact = props.filter((r) => (r.name ?? "").trim().toLowerCase() === q);
    const sub = props.filter((r) => (r.name ?? "").toLowerCase().includes(q));
    const property = exact.length === 1 ? exact[0] : exact.length === 0 && sub.length === 1 ? sub[0] : null;
    if (exact.length > 1 || (exact.length === 0 && sub.length > 1)) {
      return { created: false, reason: `"${input.property}" matches more than one property — which one?` };
    }
    if (!property) return { created: false, reason: `No property matches "${input.property}".` };

    // Resolve a STAFFED turnover (status 'assigned', has a cleaner) for the date
    // or the soonest upcoming (never a past turnover).
    let taskQuery = supabase
      .from("cleaning_tasks")
      .select("id, scheduled_date, status, cleaner_id")
      .eq("property_id", property.id)
      .eq("status", "assigned")
      .not("cleaner_id", "is", null)
      .order("scheduled_date", { ascending: true });
    taskQuery = input.date
      ? taskQuery.eq("scheduled_date", input.date)
      : taskQuery.gte("scheduled_date", localDate(property.timezone));
    const { data: taskRows } = await taskQuery.limit(1);
    const tasks = (taskRows ?? []) as { id: string; scheduled_date: string; cleaner_id: string }[];
    if (tasks.length === 0) {
      return {
        created: false,
        reason: input.date
          ? `No staffed turnover at ${property.name} on ${input.date} (assign a cleaner first).`
          : `No upcoming staffed turnover at ${property.name} (assign a cleaner first).`,
      };
    }
    const task = tasks[0];

    // Resolve the cleaner's name for the display block.
    const { data: cleanerRows } = await supabase
      .from("cleaners")
      .select("name")
      .eq("id", task.cleaner_id)
      .eq("user_id", hostId)
      .limit(1);
    const cleanerName = ((cleanerRows ?? []) as { name: string | null }[])[0]?.name ?? "the cleaner";

    const block: BlockData = {
      kind: "turnover",
      data: {
        property: property.name ?? "Property",
        date: task.scheduled_date,
        status: "assigned",
        cleanerName,
      },
    };

    const { proposal } = await createProposal(supabase, {
      hostId,
      propertyId: property.id,
      actionType: "notify_cleaner",
      payload: { block, action: { taskId: task.id } },
      rationale: input.rationale,
      createdBy: "agent",
    });

    return { created: true, proposal_id: proposal.id };
  },
};
