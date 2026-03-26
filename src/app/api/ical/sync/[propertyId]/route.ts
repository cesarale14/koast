import { NextResponse } from "next/server";
import { db } from "@/lib/db/connection";
import { syncICalFeeds } from "@/lib/ical/sync";

export async function POST(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    const results = await syncICalFeeds(db, params.propertyId);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
