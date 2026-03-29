import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateDraft } from "@/lib/claude/messaging";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { messageId } = await request.json();
    if (!messageId) {
      return NextResponse.json({ error: "messageId required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Fetch message
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, property_id, booking_id, content, platform, sender_name")
      .eq("id", messageId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = ((msgs ?? []) as any[])[0];
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const isOwner = await verifyPropertyOwnership(user.id, message.property_id);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Fetch property
    const { data: props } = await supabase
      .from("properties")
      .select("name, city, bedrooms, bathrooms, max_guests")
      .eq("id", message.property_id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const property = ((props ?? []) as any[])[0];
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // Fetch booking if linked
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let booking: any = null;
    if (message.booking_id) {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("guest_name, check_in, check_out, num_guests, total_price")
        .eq("id", message.booking_id)
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      booking = ((bookings ?? []) as any[])[0] ?? null;
    }

    // Fetch conversation history for this property + guest
    const { data: history } = await supabase
      .from("messages")
      .select("direction, content")
      .eq("property_id", message.property_id)
      .order("created_at", { ascending: true })
      .limit(20);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conversationHistory = ((history ?? []) as any[])
      .filter((m) => m.id !== messageId)
      .map((m) => ({
        role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
        content: m.content as string,
      }));

    // Fetch property details (WiFi, door code, etc.)
    const { data: detailsData } = await supabase
      .from("property_details")
      .select("wifi_network, wifi_password, door_code, checkin_time, checkout_time, parking_instructions, house_rules, special_instructions")
      .eq("property_id", message.property_id)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const details = ((detailsData ?? []) as any[])[0] ?? null;

    // Generate draft
    const draft = await generateDraft(property, booking, conversationHistory, message.content, details);

    // Save draft to message
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("messages") as any)
      .update({ ai_draft: draft, ai_draft_status: "generated" })
      .eq("id", messageId);

    return NextResponse.json({ draft, messageId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[messages/draft] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
