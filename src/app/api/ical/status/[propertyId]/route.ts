import { NextResponse } from "next/server";
import { db } from "@/lib/db/connection";
import { icalFeeds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";

export async function GET(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const feeds = await db.select().from(icalFeeds)
      .where(eq(icalFeeds.propertyId, params.propertyId));

    return NextResponse.json({ feeds });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
