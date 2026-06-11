/**
 * read_pricing — P3.1 read tool. Returns the host's pending pricing
 * recommendations as a `blocks` render payload of price_diff blocks (current →
 * suggested, with the never-red delta + reason), so "where am I leaving money
 * on the table" answers as the app's own price-diff cards.
 *
 * Non-gated (read-only). Reads the pricing_recommendations base table (the same
 * source the canonical /api/pricing/recommendations reader uses), pending rows,
 * scoped to the host's properties. Blocks are id-LEAN
 * (display only); the actionable apply path is a separate OTA proposal (P3.2),
 * never wired here. When the render flag is off the model still gets this data
 * as the tool_result JSON and answers in prose.
 */

import { z } from "zod";
import type { Tool } from "../types";
import { createServiceClient } from "@/lib/supabase/service";
import { renderPayloadSchema, type RenderPayload } from "@/lib/agent/render/types";
import type { BlockData } from "@/lib/agent/render/blocks";
import { isRecFresh, todayStrUTC } from "@/lib/pricing/freshness";

const ReadPricingInputSchema = z.object({});
type ReadPricingInput = z.infer<typeof ReadPricingInputSchema>;

const DESCRIPTION = `List the host's pending pricing recommendations — per date, the current rate, the engine's suggested rate, the dollar delta, and why. Use this for "where am I leaving money on the table", "what does Koast suggest on rates", "should I change my prices".

Read-only; the data is built server-side from the live pricing engine output (you do not pass it in). Lead the prose with the biggest opportunity. To actually CHANGE a rate you propose it (a separate step the host approves) — this tool only shows the picture.`;

type RecRow = {
  date: string;
  current_rate: number | string | null;
  suggested_rate: number | string | null;
  delta_abs: number | string | null;
  reason_text: string | null;
  urgency: "act_now" | "coming_up" | "review" | null;
  created_at: string | null;
};

const URGENCY_ORDER: Record<string, number> = { act_now: 0, coming_up: 1, review: 2 };

function num(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export const readPricingTool: Tool<ReadPricingInput, RenderPayload> = {
  name: "read_pricing",
  description: DESCRIPTION,
  inputSchema: ReadPricingInputSchema,
  outputSchema: renderPayloadSchema,
  requiresGate: false,
  handler: async (_input, context) => {
    const supabase = createServiceClient();

    // Host-scope via owned properties (the view carries property_id, not host_id).
    const { data: propRows } = await supabase
      .from("properties")
      .select("id")
      .eq("user_id", context.host.id);
    const propIds = ((propRows ?? []) as { id: string }[]).map((p) => p.id);
    if (propIds.length === 0) return { v: 1, kind: "blocks", blocks: [] };

    // Read the BASE table (the same source the canonical /api/pricing/
    // recommendations reader uses). The pricing_recommendations_latest VIEW
    // predates the status/urgency/reason_text columns and lacks them — querying
    // it for those errors; the dedup unique index guarantees one pending row per
    // (property, date), so the base table + status='pending' is correct. Surface
    // the error rather than swallowing it into a falsely-empty card.
    //
    // FRESHNESS (P4.2): only recs whose night hasn't passed (date >= today) AND
    // whose producing run is recent (isRecFresh). Without this the date-asc order
    // surfaced the stale PAST-date rows (Apr–Jun) FIRST and never reached today's
    // fresh set. Order by urgency→date so the biggest LIVE opportunity leads.
    const nowISO = new Date().toISOString();
    const todayStr = todayStrUTC(nowISO);
    const { data: recRows, error: recError } = await supabase
      .from("pricing_recommendations")
      .select("date, current_rate, suggested_rate, delta_abs, reason_text, urgency, created_at")
      .in("property_id", propIds)
      .eq("status", "pending")
      .gte("date", todayStr)
      .order("date", { ascending: true })
      .limit(200);
    if (recError) throw new Error(`[read_pricing] ${recError.message}`);

    const fresh = ((recRows ?? []) as RecRow[])
      .filter((r) => isRecFresh({ date: r.date, createdAt: r.created_at }, nowISO))
      .sort((a, b) => {
        const ua = URGENCY_ORDER[a.urgency ?? "review"] ?? 3;
        const ub = URGENCY_ORDER[b.urgency ?? "review"] ?? 3;
        if (ua !== ub) return ua - ub;
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      })
      .slice(0, 20);

    const blocks: BlockData[] = fresh.map((r) => ({
      kind: "price_diff",
      data: {
        date: r.date,
        currentRate: num(r.current_rate),
        suggestedRate: num(r.suggested_rate),
        deltaAbs: num(r.delta_abs),
        reason: r.reason_text,
        urgency: r.urgency,
      },
    }));

    return { v: 1, kind: "blocks", blocks };
  },
};
