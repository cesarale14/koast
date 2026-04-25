import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser, verifyReviewOwnership } from "@/lib/auth/api-auth";

// POST /api/reviews/[reviewId]/guest-name
// body: { name: string }
//
// Set / clear the manual override for a review's display guest name.
// Used to recover identities for reviews whose underlying booking has
// aged out of Channex's /bookings window (channex-expert known-quirks
// #20). Empty string clears the override.
export async function POST(
  request: NextRequest,
  { params }: { params: { reviewId: string } },
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyReviewOwnership(user.id, params.reviewId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => null);
    const raw = (body && typeof body === "object" && "name" in body) ? body.name : undefined;
    if (raw != null && typeof raw !== "string") {
      return NextResponse.json({ error: "name must be a string" }, { status: 400 });
    }
    const trimmed = (raw ?? "").trim();
    if (trimmed.length > 200) {
      return NextResponse.json({ error: "name too long (max 200 chars)" }, { status: 400 });
    }
    const value: string | null = trimmed === "" ? null : trimmed;

    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("guest_reviews") as any)
      .update({ guest_name_override: value })
      .eq("id", params.reviewId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, guest_name_override: value });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
