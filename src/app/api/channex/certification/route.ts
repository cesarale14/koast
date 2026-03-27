import { NextRequest, NextResponse } from "next/server";
import { setupTestProperty, runCertification } from "@/lib/channex/certification";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));

    // If config provided, use it; otherwise set up new test property
    let config = body.config;
    if (!config) {
      console.log("[cert] Setting up test property...");
      config = await setupTestProperty();
      console.log("[cert] Test property config:", JSON.stringify(config, null, 2));
    }

    console.log("[cert] Running certification tests...");
    const results = await runCertification(config);

    const passed = results.filter((r) => r.status === "pass").length;
    const failed = results.filter((r) => r.status === "fail").length;

    console.log(`\n[cert] ===== CERTIFICATION RESULTS =====`);
    console.log(`[cert] Passed: ${passed}/${results.length}, Failed: ${failed}`);
    for (const r of results) {
      console.log(`[cert] Test ${r.test}: ${r.name} — ${r.status}${r.error ? ` (${r.error})` : ""}`);
    }

    return NextResponse.json({
      config,
      results,
      summary: { total: results.length, passed, failed },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cert] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
