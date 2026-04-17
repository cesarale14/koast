import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSMSOrThrow } from "@/lib/notifications/sms";

async function getUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// Normalize phone numbers to E.164 (assumes US if no country code)
function normalizePhone(input: string): string {
  const trimmed = input.trim().replace(/[^\d+]/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.length === 10) return `+1${trimmed}`;
  if (trimmed.length === 11 && trimmed.startsWith("1")) return `+${trimmed}`;
  return `+${trimmed}`;
}

// GET /api/cleaners — list user's cleaners
export async function GET() {
  try {
    const { supabase, user } = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("cleaners")
      .select("id, name, phone, email, is_active, created_at")
      .eq("user_id", user.id)
      .order("name");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[cleaners] GET error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

// POST /api/cleaners — create a cleaner
export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    console.log("[cleaners] POST body:", body);
    if (!body.name || !body.phone) {
      return NextResponse.json({ error: "Name and phone required" }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(body.phone);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("cleaners") as any)
      .insert({
        user_id: user.id,
        name: body.name,
        phone: normalizedPhone,
        email: body.email ?? null,
      })
      .select("id, name, phone, email, is_active")
      .single();

    if (error) {
      console.error("[cleaners] POST insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[cleaners] POST error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

// PATCH /api/cleaners — update a cleaner
export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.phone !== undefined) updates.phone = normalizePhone(body.phone);
    if (body.email !== undefined) updates.email = body.email;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("cleaners") as any)
      .update(updates)
      .eq("id", body.id)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ updated: true });
  } catch (err) {
    console.error("[cleaners] PATCH error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

// DELETE /api/cleaners — remove a cleaner
export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user } = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const { error } = await supabase.from("cleaners").delete().eq("id", id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[cleaners] DELETE error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

// PUT /api/cleaners — send test SMS
export async function PUT(request: NextRequest) {
  try {
    const { user } = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    console.log("[cleaners] PUT (test SMS) body:", body);
    if (!body.phone) return NextResponse.json({ error: "Phone required" }, { status: 400 });

    const normalizedPhone = normalizePhone(body.phone);
    const sid = await sendSMSOrThrow(
      normalizedPhone,
      "Koast: Test message — your number is connected."
    );
    console.log("[cleaners] test SMS sent successfully:", sid);
    return NextResponse.json({ success: true, sid });
  } catch (err) {
    console.error("[cleaners] PUT (test SMS) error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
