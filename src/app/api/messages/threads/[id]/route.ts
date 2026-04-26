// MSG-S1 Phase D — GET /api/messages/threads/[id]
//
// Single thread + its messages, sorted ascending by
// channex_inserted_at (chronological). Auth-gated by ownership of
// the parent property.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const threadId = params.id;
    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tRows } = await (supabase.from("message_threads") as any)
      .select("*")
      .eq("id", threadId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const thread = ((tRows as any[] | null) ?? [])[0];
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const owned = await verifyPropertyOwnership(user.id, thread.property_id);
    if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: msgs } = await (supabase.from("messages") as any)
      .select(
        "id, thread_id, channex_message_id, direction, sender, sender_name, content, " +
        "attachments, read_at, channex_inserted_at, created_at"
      )
      .eq("thread_id", threadId)
      .order("channex_inserted_at", { ascending: true });

    return NextResponse.json({
      thread,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: ((msgs as any[] | null) ?? []),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/messages/threads/[id]] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
