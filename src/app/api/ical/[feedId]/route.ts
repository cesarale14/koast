import { NextResponse } from "next/server";
import { db } from "@/lib/db/connection";
import { icalFeeds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _request: Request,
  { params }: { params: { feedId: string } }
) {
  try {
    await db.update(icalFeeds)
      .set({ isActive: false })
      .where(eq(icalFeeds.id, params.feedId));
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
