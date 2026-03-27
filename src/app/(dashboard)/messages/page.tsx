import { createClient } from "@/lib/supabase/server";
import UnifiedInbox from "@/components/dashboard/UnifiedInbox";

export default async function MessagesPage() {
  const supabase = createClient();

  // Fetch all messages, properties, and bookings
  const messagesRes = await supabase
    .from("messages")
    .select("id, property_id, booking_id, platform, direction, sender_name, content, ai_draft, ai_draft_status, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages = (messagesRes.data ?? []) as any[];

  const propertiesRes = await supabase
    .from("properties")
    .select("id, name, city")
    .order("name");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = (propertiesRes.data ?? []) as any[];

  const bookingsRes = await supabase
    .from("bookings")
    .select("id, guest_name, check_in, check_out, property_id")
    .order("check_in", { ascending: false })
    .limit(200);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookingsRes.data ?? []) as any[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-800 mb-1">Messages</h1>
        <p className="text-neutral-500">Unified inbox across all platforms</p>
      </div>
      <UnifiedInbox messages={messages} properties={properties} bookings={bookings} />
    </div>
  );
}
