/**
 * read_pricing — P3.1 read tool. Returns the host's pending pricing
 * recommendations as a `blocks` render payload of price_diff blocks (current →
 * suggested, with the never-red delta + reason), so "where am I leaving money
 * on the table" answers as the app's own price-diff cards.
 *
 * Non-gated (read-only). Reads pricing_recommendations_latest (the same view the
 * Pricing surface reads) scoped to the host's properties. Blocks are id-LEAN
 * (display only); the actionable apply path is a separate OTA proposal (P3.2),
 * never wired here. When the render flag is off the model still gets this data
 * as the tool_result JSON and answers in prose.
 */

import { z } from "zod";
import type { Tool } from "../types";
import { createServiceClient } from "@/lib/supabase/service";
import { renderPayloadSchema, type RenderPayload } from "@/lib/agent/render/types";
import type { BlockData } from "@/lib/agent/render/blocks";

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
};

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

    const { data: recRows } = await supabase
      .from("pricing_recommendations_latest")
      .select("date, current_rate, suggested_rate, delta_abs, reason_text, urgency")
      .in("property_id", propIds)
      .eq("status", "pending")
      .order("date", { ascending: true })
      .limit(20);

    const blocks: BlockData[] = ((recRows ?? []) as RecRow[]).map((r) => ({
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
