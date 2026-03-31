import { createClient } from "@/lib/supabase/server";
import BookingsClient from "./BookingsClient";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: props } = await supabase
    .from("properties")
    .select("id, name, cover_photo_url")
    .eq("user_id", user.id)
    .order("name");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = (props ?? []) as any[];
  const propertyIds = properties.map((p: { id: string }) => p.id);

  if (propertyIds.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold text-neutral-800 mb-1">Bookings</h1>
        <p className="text-sm text-neutral-500 mb-8">All reservations across your properties</p>
        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-16 text-center">
          <p className="text-neutral-400">Add a property first to see bookings.</p>
        </div>
      </div>
    );
  }

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, property_id, guest_name, guest_email, guest_phone, check_in, check_out, platform, total_price, num_guests, status, notes")
    .in("property_id", propertyIds)
    .order("check_in", { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allBookings = (bookings ?? []) as any[];

  return <BookingsClient bookings={allBookings} properties={properties} />;
}
