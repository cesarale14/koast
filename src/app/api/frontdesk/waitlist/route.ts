import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    const supabase = createServiceClient();
    await supabase.from("leads").insert({
      email,
      source: "frontdesk_waitlist",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[frontdesk/waitlist]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
