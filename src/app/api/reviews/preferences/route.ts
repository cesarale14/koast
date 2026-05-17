/**
 * /api/reviews/preferences — M9 Phase G E3 (v2.6) Q-G6 β path.
 *
 * Per-host review preferences CRUD. Replaces the dropped
 * /api/reviews/rules/[propertyId] path (per-property scoping eliminated
 * per Q-G2 locus shift; host_id derived from session auth).
 *
 * GET — read the host's preferences. Returns DEFAULT_REVIEW_PREFERENCES_PAYLOAD
 *       if no fact exists yet (no null leak; matches historical route
 *       fallback shape). Response wrapper `{ rule }` preserves the
 *       client-side shape ReviewsSettingsModal already consumes.
 * PUT  — write/update preferences. Validates body via the Zod schema;
 *       writeReviewPreferences upserts with supersession of the prior
 *       active fact.
 *
 * Auth: getAuthenticatedUser. host_id from session. No property-ownership
 * check needed (preferences are per-host, not per-property).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthenticatedUser } from "@/lib/auth/api-auth";
import {
  readReviewPreferences,
  writeReviewPreferences,
} from "@/lib/memory/review-preferences";
import {
  ReviewPreferencesPayloadSchema,
  DEFAULT_REVIEW_PREFERENCES_PAYLOAD,
} from "@/lib/memory/review-preferences-fact-schema";

export async function GET() {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = createServiceClient();
    const rule = await readReviewPreferences(supabase, user.id);
    return NextResponse.json({ rule });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    // Merge incoming partial against DEFAULT so callers can PUT a subset.
    // ReviewsSettingsModal sends the full payload today; this merge is
    // defense-in-depth + Zod validation surface.
    const candidate = {
      ...DEFAULT_REVIEW_PREFERENCES_PAYLOAD,
      ...body,
    };
    const parsed = ReviewPreferencesPayloadSchema.safeParse(candidate);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: `Invalid payload: ${parsed.error.issues
            .map((i) => i.message)
            .join("; ")}`,
        },
        { status: 400 },
      );
    }
    const supabase = createServiceClient();
    await writeReviewPreferences(supabase, user.id, parsed.data);
    return NextResponse.json({ rule: parsed.data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
