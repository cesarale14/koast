/**
 * read_turnovers — P3.1 read tool. Returns the host's turnovers (today onward,
 * the same window the Today strip shows) as a `blocks` render payload of
 * turnover blocks, so the agent answers "what cleanings are coming up" as the
 * app's own turnover cards, not a text summary.
 *
 * Non-gated (read-only). Reuses readTodayTurnovers — the SAME query the Today
 * surface uses — so the agent and the page can't drift. Blocks are id-LEAN (no
 * taskId/cleanerId): a rendered turnover card here is read-only display; the
 * actionable assign path is a separate proposal (P3.2). When the render flag is
 * off the model still receives this data as the tool_result JSON and answers in
 * prose; the card is the gated enhancement.
 */

import { z } from "zod";
import type { Tool } from "../types";
import { createServiceClient } from "@/lib/supabase/service";
import { readTodayTurnovers } from "@/lib/today/readTodayTurnovers";
import { renderPayloadSchema, type RenderPayload } from "@/lib/agent/render/types";
import type { BlockData } from "@/lib/agent/render/blocks";

const ReadTurnoversInputSchema = z.object({});
type ReadTurnoversInput = z.infer<typeof ReadTurnoversInputSchema>;

const DESCRIPTION = `List the host's turnovers (cleanings) from today onward — property, date, status (needs a cleaner / dispatched / in progress / done), the assigned cleaner, and how many confirmation photos are in. Use this for "what cleanings are coming up", "which turnovers need a cleaner", "is the Villa cleaned".

Read-only; the data is built server-side from live Koast cleaning tasks (you do not pass it in). Pair the card with a short prose summary that leads with anything that needs the host (an unstaffed turnover today).`;

/** Host-local today (YYYY-MM-DD) from the primary property timezone (ET default) — the same window the Today surface uses. */
async function hostLocalToday(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  hostId: string,
): Promise<string> {
  const { data } = await supabase
    .from("properties")
    .select("timezone")
    .eq("user_id", hostId)
    .not("timezone", "is", null)
    .limit(1);
  const tz = (data?.[0]?.timezone as string | undefined) || "America/New_York";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export const readTurnoversTool: Tool<ReadTurnoversInput, RenderPayload> = {
  name: "read_turnovers",
  description: DESCRIPTION,
  inputSchema: ReadTurnoversInputSchema,
  outputSchema: renderPayloadSchema,
  requiresGate: false,
  handler: async (_input, context) => {
    const supabase = createServiceClient();
    const today = await hostLocalToday(supabase, context.host.id);
    const { turnovers } = await readTodayTurnovers(supabase, context.host.id, today);
    const blocks: BlockData[] = turnovers.map((t) => ({
      kind: "turnover",
      data: {
        property: t.property,
        date: t.date,
        status: t.status,
        cleanerName: t.cleanerName,
        photoCount: t.photoCount,
      },
    }));
    return { v: 1, kind: "blocks", blocks };
  },
};
