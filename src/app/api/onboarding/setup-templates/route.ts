import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_ONBOARDING_TEMPLATES } from "@/lib/onboarding/default-templates";

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { propertyId } = await request.json();
    if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });

    const supabase = createClient();

    // Verify ownership
    const { data: prop } = await supabase
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("user_id", user.id)
      .single();
    if (!prop) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    // Insert default templates
    const templates = DEFAULT_ONBOARDING_TEMPLATES.map((t) => ({
      property_id: propertyId,
      template_type: t.templateType,
      subject: t.subject,
      body: t.body,
      is_active: true,
      trigger_type: t.triggerType,
      trigger_days_offset: t.triggerDaysOffset,
      trigger_time: t.triggerTime,
    }));

    const { error } = await supabase.from("message_templates").insert(templates);
    if (error) throw error;

    return NextResponse.json({ created: templates.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
