import { NextResponse } from "next/server";
import { db } from "@/lib/db/connection";
import { icalFeeds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const feeds = await db.select().from(icalFeeds)
      .where(eq(icalFeeds.propertyId, params.propertyId));

    return NextResponse.json({ feeds });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
