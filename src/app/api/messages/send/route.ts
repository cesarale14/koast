import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  try {
    const { propertyId, bookingId, platform, content, isAutoReply } = await request.json();

    if (!propertyId || !content || !platform) {
      return NextResponse.json({ error: "propertyId, platform, and content required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("messages") as any)
      .insert({
        property_id: propertyId,
        booking_id: bookingId || null,
        platform,
        direction: "outbound",
        sender_name: "Host",
        content,
        ai_draft_status: isAutoReply ? "sent" : "none",
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[messages/send] Insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id, sent: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[messages/send] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
