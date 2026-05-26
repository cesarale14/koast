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

const EVENT_KIND = ["chat_view", "inspect_view", "inspect_entry"] as const;
const TASK_CLASS = [
  "scan",
  "bulk_operate",
  "visual_survey",
  "config",
  "external_link",
  "other",
] as const;
const ENTRY_TRIGGER = ["agent_offered_navchip", "self_navigated"] as const;

const eventSchema = z.object({
  session_id: z.string().min(1).max(128),
  event_kind: z.enum(EVENT_KIND),
  pathname: z.string().min(1).max(512),
  task_class: z.enum(TASK_CLASS).nullable().optional(),
  entry_trigger: z.enum(ENTRY_TRIGGER).nullable().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  ts: z.string().datetime().optional(),
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
    const rows = parsed.events.map((e) => ({
      host_id: user.id,
      session_id: e.session_id,
      event_kind: e.event_kind,
      pathname: e.pathname,
      task_class: e.task_class ?? null,
      entry_trigger: e.entry_trigger ?? null,
      context: e.context ?? {},
      ...(e.ts ? { ts: e.ts } : {}),
    }));

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
