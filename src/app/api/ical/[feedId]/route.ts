import { NextResponse } from "next/server";
import { db } from "@/lib/db/connection";
import { icalFeeds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";

export async function DELETE(
  _request: Request,
  { params }: { params: { feedId: string } }
) {
  try {
    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Look up the feed to verify ownership of its property
    const [feed] = await db.select({ propertyId: icalFeeds.propertyId }).from(icalFeeds).where(eq(icalFeeds.id, params.feedId)).limit(1);
    if (!feed) return NextResponse.json({ error: "Feed not found" }, { status: 404 });

    const isOwner = await verifyPropertyOwnership(user.id, feed.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await db.update(icalFeeds)
      .set({ isActive: false })
      .where(eq(icalFeeds.id, params.feedId));
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
