import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("review_rules")
      .select("*")
      .eq("property_id", params.propertyId)
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rule = ((data ?? []) as any[])[0] ?? null;
    return NextResponse.json({ rule });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  try {
    const body = await request.json();
    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = supabase.from("review_rules") as any;
    const { data: existing } = await table
      .select("id")
      .eq("property_id", params.propertyId)
      .limit(1);

    const ruleData = {
      property_id: params.propertyId,
      is_active: body.is_active ?? true,
      auto_publish: body.auto_publish ?? false,
      publish_delay_days: body.publish_delay_days ?? 3,
      tone: body.tone ?? "warm",
      target_keywords: body.target_keywords ?? [],
      bad_review_delay: body.bad_review_delay ?? true,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (existing && (existing as any[]).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await table.update(ruleData).eq("id", (existing as any[])[0].id);
    } else {
      await table.insert(ruleData);
    }

    return NextResponse.json({ saved: true, rule: ruleData });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
