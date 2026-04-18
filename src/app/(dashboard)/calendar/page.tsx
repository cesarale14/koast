import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import CalendarView from "@/components/polish/CalendarView";
import { KoastEmptyState } from "@/components/polish/KoastEmptyState";
import { KoastButton } from "@/components/polish/KoastButton";

const TOTAL_DAYS = 730;

export default async function CalendarPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const yesterdayUtc = new Date();
  yesterdayUtc.setUTCDate(yesterdayUtc.getUTCDate() - 1);
  const today = yesterdayUtc.toISOString().split("T")[0];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + TOTAL_DAYS);
  const end = endDate.toISOString().split("T")[0];

  const propertiesRes = await supabase
    .from("properties")
    .select("id, name, cover_photo_url")
    .eq("user_id", user.id)
    .order("name");
  const properties = (propertiesRes.data ?? []) as { id: string; name: string; cover_photo_url: string | null }[];

  if (properties.length === 0) {
    return (
      <div style={{ padding: 48 }}>
        <KoastEmptyState
          title="No properties yet"
          body="Add your first property to see the calendar."
          action={
            <Link href="/properties">
              <KoastButton variant="primary">Add a property</KoastButton>
            </Link>
          }
        />
      </div>
    );
  }

  const propertyIds = properties.map((p) => p.id);
  const svc = createServiceClient();
  const [bookingsRes, ratesRes] = await Promise.all([
    svc
      .from("bookings")
      .select(
        "id, property_id, guest_name, check_in, check_out, platform, total_price, num_guests, status"
      )
      .in("property_id", propertyIds)
      .lte("check_in", end)
      .gte("check_out", today)
      .in("status", ["confirmed", "completed", "pending"]),
    svc
      .from("calendar_rates")
      .select(
        "property_id, date, base_rate, suggested_rate, applied_rate, min_stay, is_available, rate_source"
      )
      .in("property_id", propertyIds)
      .is("channel_code", null)
      .gte("date", today)
      .lte("date", end),
  ]);

  const bookings = (bookingsRes.data ?? []) as {
    id: string;
    property_id: string;
    guest_name: string | null;
    check_in: string;
    check_out: string;
    platform: string;
    total_price: number | null;
    num_guests: number | null;
    status: string;
  }[];

  const rates = (ratesRes.data ?? []) as {
    property_id: string;
    date: string;
    base_rate: number | null;
    suggested_rate: number | null;
    applied_rate: number | null;
    min_stay: number;
    is_available: boolean;
    rate_source: string;
  }[];

  return <CalendarView properties={properties} bookings={bookings} rates={rates} />;
}
