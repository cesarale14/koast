import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_PREFS = {
  email_new_booking: true,
  email_messages: true,
  email_cleaning: true,
  email_price_alerts: false,
  sms_enabled: false,
  push_enabled: false,
};

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("user_preferences")
    .select("preferences")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({ preferences: data?.preferences ?? DEFAULT_PREFS });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const prefs = { ...DEFAULT_PREFS, ...body.preferences };

  const { error } = await supabase
    .from("user_preferences")
    .upsert(
      { user_id: user.id, preferences: prefs },
      { onConflict: "user_id" }
    );

  if (error) {
    // Table might not exist yet — fall back gracefully
    console.error("[preferences] upsert error:", error.message);
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }

  return NextResponse.json({ preferences: prefs });
}
