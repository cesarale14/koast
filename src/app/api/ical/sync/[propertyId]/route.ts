import { NextResponse } from "next/server";
import { db } from "@/lib/db/pooled";
import { syncICalFeeds } from "@/lib/ical/sync";
import { getAuthenticatedUser, verifyPropertyOwnership } from "@/lib/auth/api-auth";

const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function POST(
  _request: Request,
  { params }: { params: { propertyId: string } }
) {
  try {
    if (!isValidUUID(params.propertyId)) return NextResponse.json({ error: "Invalid property ID" }, { status: 400 });

    const { user } = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isOwner = await verifyPropertyOwnership(user.id, params.propertyId);
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const results = await syncICalFeeds(db, params.propertyId);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
