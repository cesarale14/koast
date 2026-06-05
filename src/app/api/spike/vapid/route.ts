/* THROWAWAY SPIKE — returns the VAPID public key so the client can subscribe
 * without baking a NEXT_PUBLIC_ build-time var. Delete with the spike branch. */
import { NextResponse } from "next/server";
import { getVapid } from "@/lib/spike/vapid";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ publicKey: getVapid().publicKey });
}
