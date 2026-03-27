import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CalendarGrid from "@/components/calendar/CalendarGrid";

const TOTAL_DAYS = 60;

export default async function CalendarPage() {
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + TOTAL_DAYS);
  const end = endDate.toISOString().split("T")[0];

  const propertiesRes = await supabase
    .from("properties")
    .select("id, name")
    .order("name");
  const properties = (propertiesRes.data ?? []) as { id: string; name: string }[];

  if (properties.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-neutral-800 mb-1">Calendar</h1>
        <p className="text-neutral-500 mb-8">Multi-property availability calendar</p>

        <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-16 text-center">
          <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-neutral-800 mb-2">No properties yet</h2>
          <p className="text-neutral-500 mb-6 max-w-md mx-auto">
            Add your first property to see the multi-property calendar view.
          </p>
          <Link
            href="/properties"
            className="inline-flex px-5 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
          >
            Add Your First Property
          </Link>
        </div>
      </div>
    );
  }

  // Fetch bookings and rates for next 60 days
  const bookingsRes = await supabase
    .from("bookings")
    .select(
      "id, property_id, guest_name, guest_email, guest_phone, check_in, check_out, platform, total_price, num_guests, status, notes"
    )
    .lte("check_in", end)
    .gte("check_out", today)
    .in("status", ["confirmed", "completed", "pending"]);

  const ratesRes = await supabase
    .from("calendar_rates")
    .select(
      "property_id, date, base_rate, suggested_rate, applied_rate, min_stay, is_available, rate_source"
    )
    .gte("date", today)
    .lte("date", end);

  const bookings = (bookingsRes.data ?? []) as {
    id: string;
    property_id: string;
    guest_name: string | null;
    guest_email: string | null;
    guest_phone: string | null;
    check_in: string;
    check_out: string;
    platform: string;
    total_price: number | null;
    num_guests: number | null;
    status: string;
    notes: string | null;
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-800 mb-1">Calendar</h1>
        <p className="text-neutral-500">Multi-property availability calendar</p>
      </div>

      <CalendarGrid
        properties={properties}
        bookings={bookings}
        rates={rates}
        totalDays={TOTAL_DAYS}
      />
    </div>
  );
}
