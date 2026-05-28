/**
 * POST /api/telemetry/surface — M13 Phase 1.A STEP 4.
 *
 * Inserts host_surface_telemetry rows. Accepts a small batch (1-50 events)
 * per call so the client batcher can post a flush window of events at once.
 *
 * AUTH + HOST_ID DISCIPLINE (operator msg 3518 A8 binding):
 *   The endpoint derives host_id from the authenticated session.
 *   The endpoint NEVER trusts a client-supplied host_id.
 *   Foreign-tenant rows would be impossible to write even if the client
 *   tried; the column is set server-side from auth.getUser().
 *
 * §6.16 nullable-permanent contract: entry_trigger and task_class are
 * NULL-permitted at schema level. Client may omit them when not relevant
 * (e.g. chat_view heartbeats carry no task_class). DB CHECK still validates
 * the controlled vocabulary for any non-null value.
 *
 * Request body shape:
 *   {
 *     events: Array<{
 *       session_id: string,
 *       event_kind: 'chat_view' | 'inspect_view' | 'inspect_entry',
 *       pathname: string,
 *       task_class?: 'scan' | 'bulk_operate' | 'visual_survey' | 'config' | 'external_link' | 'other' | null,
 *       entry_trigger?: 'agent_offered_navchip' | 'self_navigated' | null,
 *       context?: Record<string, unknown>,
 *       ts?: string  // ISO8601; defaults to now() at DB
 *     }>
 *   }
 *
 * Response 200:
 *   { inserted: number }
 *
 * Response 400: malformed body / batch size out of range
 * Response 401: unauthenticated
 * Response 500: insert failed
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const EVENT_KIND = [
  "chat_view",
  "inspect_view",
  "inspect_entry",
  // M13 Phase 1.B — perf measurement event_kind.
  "fluidity_measurement",
] as const;
const TASK_CLASS = [
  "scan",
  "bulk_operate",
  "visual_survey",
  "config",
  "external_link",
  "other",
] as const;
const ENTRY_TRIGGER = ["agent_offered_navchip", "self_navigated"] as const;
// M13 Phase 1.B — fluidity controlled vocab. Mirrors
// scripts/fluidity-budgets.json keys + matches the DB CHECK constraint.
const BUDGET_CLASS = [
  "property_focus",
  "chat_start_of_stream",
  "cmd_k_first_result",
  "route_nav",
  "perceived_action",
] as const;
const EVENT_CATEGORY = ["navigation", "perf"] as const;

const eventSchema = z
  .object({
    session_id: z.string().min(1).max(128),
    event_kind: z.enum(EVENT_KIND),
    pathname: z.string().min(1).max(512),
    task_class: z.enum(TASK_CLASS).nullable().optional(),
    entry_trigger: z.enum(ENTRY_TRIGGER).nullable().optional(),
    // M13 Phase 1.B — fluidity fields.
    event_category: z.enum(EVENT_CATEGORY).optional(),
    latency_ms: z.number().nonnegative().finite().nullable().optional(),
    budget_class: z.enum(BUDGET_CLASS).nullable().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
    ts: z.string().datetime().optional(),
  })
  .superRefine((ev, ctx) => {
    // Cross-column contract: perf rows REQUIRE latency_ms + budget_class.
    // CHECK constraints at the DB can't enforce cross-column rules cleanly;
    // the API is the single insert path, so enforce here.
    if (
      ev.event_category === "perf" ||
      ev.event_kind === "fluidity_measurement"
    ) {
      if (typeof ev.latency_ms !== "number") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["latency_ms"],
          message: "perf-class telemetry requires latency_ms (number, ms)",
        });
      }
      if (!ev.budget_class) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["budget_class"],
          message:
            "perf-class telemetry requires budget_class (one of the enumerated values)",
        });
      }
    }
  });

const bodySchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
});

export async function POST(req: Request) {
  try {
    // Auth: derive host_id from the authenticated session per A8.
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "unauthenticated" },
        { status: 401 },
      );
    }

    let parsed;
    try {
      const json = await req.json();
      parsed = bodySchema.parse(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `malformed body: ${message}` },
        { status: 400 },
      );
    }

    // Service role for the write — RLS would also permit it (host writes
    // own rows fits the policy), but service-role writes keep the
    // host_id-server-derived discipline explicit + match the convention
    // of every other telemetry-class endpoint in the repo.
    const service = createServiceClient();
    const rows = parsed.events.map((e) => {
      // Default event_category: perf when the event_kind names a perf
      // measurement, navigation otherwise. Lets clients omit the field
      // for chat_view / inspect_view / inspect_entry batches (back-
      // compat shape — pre-1.B clients still work unchanged).
      const eventCategory =
        e.event_category ??
        (e.event_kind === "fluidity_measurement" ? "perf" : "navigation");
      return {
        host_id: user.id,
        session_id: e.session_id,
        event_kind: e.event_kind,
        pathname: e.pathname,
        task_class: e.task_class ?? null,
        entry_trigger: e.entry_trigger ?? null,
        event_category: eventCategory,
        latency_ms: e.latency_ms ?? null,
        budget_class: e.budget_class ?? null,
        context: e.context ?? {},
        ...(e.ts ? { ts: e.ts } : {}),
      };
    });

    const { error: insertErr } = await service
      .from("host_surface_telemetry")
      .insert(rows);
    if (insertErr) {
      return NextResponse.json(
        { error: `insert failed: ${insertErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ inserted: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
