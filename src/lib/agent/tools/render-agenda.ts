/**
 * render_agenda — the agent's render DECISION for the operational agenda.
 *
 * Non-gated (read-only, no side effect, no host approval). The model calls it
 * to RENDER an agenda overview as a structured card — not to FETCH (it already
 * has the agenda in its per-turn preamble). The handler rebuilds the
 * authoritative rollup server-side and returns the typed render payload, so the
 * model never re-serializes (or garbles) the data: server owns the data,
 * frontend owns presentation, the model owns the prose + the decision to card.
 *
 * The output IS a RenderPayload; the loop detects render_agenda's result,
 * emits a `render` SSE event, and finalizes it onto agent_turns.render (mirrors
 * how a gated tool drives action_proposed). The when-to-card rule (overview →
 * card; narrow lookup / drafted message → prose) lives in the description here
 * + the system prompt (Phase D), and is guarded by the eval rig.
 */

import { z } from "zod";
import type { Tool } from "../types";
import { createServiceClient } from "@/lib/supabase/service";
import { buildAgendaRollup } from "@/lib/agent/agenda";
import { classifySufficiency } from "@/lib/agent/sufficiency";
import { toAgendaRenderPayload } from "@/lib/agent/render/agenda";
import { renderHorizonSchema, renderPayloadSchema, type RenderPayload } from "@/lib/agent/render/types";

const RenderAgendaInputSchema = z.object({
  // Carried for forward-compat (the contract accepts a horizon); v1 only wires
  // today_48h, which is what buildAgendaRollup windows. Wider horizons are a
  // later data-layer phase.
  horizon: renderHorizonSchema.optional(),
});

type RenderAgendaInput = z.infer<typeof RenderAgendaInputSchema>;

const DESCRIPTION = `Render the host's operational agenda — today + the next 48 hours — as a structured, scannable card: check-ins, check-outs, turnovers, and gap flags (e.g. unstaffed cleanings, guests awaiting a reply), grouped by property.

Call this for an OVERVIEW ask — "what's on today", "anything I'm missing", "what should I prioritize", "what's happening". Do NOT call it for a single-item lookup ("when does Jeremy check out"), a drafted message, or a quick yes/no — those stay prose. Prose is the default; the card is the earned exception for a structured, multi-item, status-bearing overview.

You ALSO answer in prose (a short, conversational summary that leads with what needs the host); the card is an enhancement, never a replacement. The agenda data is built server-side from live Koast data — you do not pass it in.`;

export const renderAgendaTool: Tool<RenderAgendaInput, RenderPayload> = {
  name: "render_agenda",
  description: DESCRIPTION,
  inputSchema: RenderAgendaInputSchema,
  outputSchema: renderPayloadSchema,
  requiresGate: false, // read-only render; the dispatcher writes the audit row directly
  handler: async (_input, context) => {
    const supabase = createServiceClient();
    // missing-essentials is derived by classifySufficiency — the SAME source
    // the prose property-gaps line uses (no drift on the gap the host cares
    // about most). A property is missing essentials when missing_count > 0.
    const [rollup, sufficiency] = await Promise.all([
      buildAgendaRollup(supabase, context.host.id),
      classifySufficiency(supabase, context.host.id),
    ]);
    const missingEssentials = sufficiency.per_property
      .filter((p) => p.missing_count > 0)
      .map((p) => p.property_name ?? "a property");
    return toAgendaRenderPayload(rollup, missingEssentials);
  },
};
