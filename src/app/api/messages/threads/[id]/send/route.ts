// MSG-S2 Phase B.1 — POST /api/messages/threads/[id]/send
//
// Auth-gated, property-ownership-checked outbound send. Calls
// Channex's POST /message_threads/:id/messages, persists the
// returned message entity locally on success, returns the new row
// shape the UI expects.
//
// In-flight dedup: a tiny in-memory map of (thread_id, body-hash)
// → in-progress promise prevents host-double-tap-Send from creating
// two outbound messages. Channex doesn't support an
// idempotency-key header on this endpoint (skill silence + probe).
//
// On Channex error: do NOT insert a local row. Return the Channex
// error verbatim so the UI can surface it (e.g. BDC closed-thread
// rejection, Airbnb content-filter rejection).

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { sendMessage as channexSendMessage, ChannexSendError } from "@/lib/channex/messages";
import { createHash } from "crypto";

const MAX_BODY_LEN = 5000; // permissive cap; Airbnb ~1000 typical, BDC larger

// In-flight dedup: thread_id + body-hash → outstanding promise.
// 5s window. Survives only within the same Vercel function invocation
// — Edge / serverless cold starts reset it, which is fine because
// the optimistic UI also disables Send while a request is in flight.
const inflight = new Map<string, { promise: Promise<Response>; expiresAt: number }>();
const INFLIGHT_WINDOW_MS = 5000;

function bodyHash(threadId: string, body: string): string {
  return createHash("sha256").update(`${threadId}:${body}`).digest("hex").slice(0, 16);
}

function clearExpired() {
  const now = Date.now();
  Array.from(inflight.entries()).forEach(([k, v]) => {
    if (v.expiresAt < now) inflight.delete(k);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const threadId = params.id;
    let body: { body?: string };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const text = (body?.body ?? "").trim();
    if (!text) return NextResponse.json({ error: "body cannot be empty" }, { status: 400 });
    if (text.length > MAX_BODY_LEN) return NextResponse.json({ error: `body exceeds ${MAX_BODY_LEN} char cap` }, { status: 400 });

    const supabase = createServiceClient();

    // Resolve thread + verify ownership
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tRows } = await (supabase.from("message_threads") as any)
      .select("id, property_id, channex_thread_id, channel_code")
      .eq("id", threadId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const thread = ((tRows as any[] | null) ?? [])[0];
    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

    const owned = await verifyPropertyOwnership(user.id, thread.property_id);
    if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // In-flight dedup
    clearExpired();
    const dedupKey = bodyHash(thread.channex_thread_id, text);
    const existing = inflight.get(dedupKey);
    if (existing) {
      console.log(`[messages/send] dedup hit thread=${thread.channex_thread_id.slice(0, 8)} key=${dedupKey}`);
      return existing.promise;
    }

    const promise = (async (): Promise<Response> => {
      try {
        const channexMsg = await channexSendMessage(thread.channex_thread_id, text);

        const platform = thread.channel_code === "abb" ? "airbnb"
          : thread.channel_code === "bdc" ? "booking_com"
          : thread.channel_code;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: inserted, error: insErr } = await (supabase.from("messages") as any)
          .upsert(
            {
              channex_message_id: channexMsg.id,
              thread_id: thread.id,
              property_id: thread.property_id,
              platform,
              direction: "outbound",
              sender: channexMsg.attributes.sender ?? "property",
              sender_name: "Host",
              content: channexMsg.attributes.message,
              attachments: channexMsg.attributes.attachments ?? [],
              channex_meta: channexMsg.attributes.meta ?? null,
              channex_inserted_at: channexMsg.attributes.inserted_at,
              channex_updated_at: channexMsg.attributes.updated_at,
              host_send_submitted_at: new Date().toISOString(),
              host_send_channex_acked_at: new Date().toISOString(),
              sent_at: channexMsg.attributes.inserted_at,
            },
            { onConflict: "channex_message_id" },
          )
          .select("id, channex_message_id, content, sender, direction, channex_inserted_at, sent_at, read_at")
          .single();

        if (insErr) {
          console.error(`[messages/send] DB upsert failed after Channex 200 thread=${thread.channex_thread_id.slice(0, 8)}:`, insErr.message);
          return NextResponse.json({
            // Channex did accept — surface the warning but don't fail outright
            warning: "Send succeeded at Channex but local DB insert failed; will reconcile via webhook",
            channex_message_id: channexMsg.id,
            error: insErr.message,
          }, { status: 207 });
        }

        // Refresh thread aggregates
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("message_threads") as any)
          .update({
            last_message_received_at: channexMsg.attributes.inserted_at,
            last_message_preview: channexMsg.attributes.message?.slice(0, 200),
            updated_at: new Date().toISOString(),
          })
          .eq("id", thread.id);

        return NextResponse.json({ ok: true, message: inserted });
      } catch (err) {
        if (err instanceof ChannexSendError) {
          console.warn(`[messages/send] Channex error status=${err.status} thread=${thread.channex_thread_id.slice(0, 8)}:`, err.message);
          return NextResponse.json(
            { error: err.message, channex_status: err.status, channex_body: err.body },
            { status: err.status >= 500 ? 502 : 422 },
          );
        }
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[messages/send] error:`, msg);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    })();

    inflight.set(dedupKey, { promise, expiresAt: Date.now() + INFLIGHT_WINDOW_MS });
    try {
      const res = await promise;
      return res;
    } finally {
      // Don't clear immediately — let the dedup window run its course
      // so a retry within 5s gets the same response.
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/messages/threads/[id]/send] outer error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
