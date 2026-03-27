import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function getAuthenticatedUser() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { user: null, error: "Unauthorized" as const };
  }
  return { user, error: null };
}

export async function verifyPropertyOwnership(
  userId: string,
  propertyId: string
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("user_id", userId)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).length > 0;
}

export async function verifyBookingOwnership(
  userId: string,
  bookingId: string
): Promise<{ owned: boolean; propertyId: string | null }> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("bookings")
    .select("property_id")
    .eq("id", bookingId)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const booking = ((data ?? []) as any[])[0];
  if (!booking) return { owned: false, propertyId: null };

  const owned = await verifyPropertyOwnership(userId, booking.property_id);
  return { owned, propertyId: booking.property_id };
}

export async function verifyReviewOwnership(
  userId: string,
  reviewId: string
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("guest_reviews")
    .select("property_id")
    .eq("id", reviewId)
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const review = ((data ?? []) as any[])[0];
  if (!review) return false;
  return verifyPropertyOwnership(userId, review.property_id);
}
