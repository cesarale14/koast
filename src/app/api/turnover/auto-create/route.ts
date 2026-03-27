import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { backfillCleaningTasks } from "@/lib/turnover/auto-create";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

export async function POST() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServiceClient();
    const result = await backfillCleaningTasks(supabase);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[turnover/auto-create] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
