import { createClient } from "@/lib/supabase/server";
import UnifiedInbox from "@/components/dashboard/UnifiedInbox";
import TemplateManager from "@/components/dashboard/TemplateManager";
import MessagesPageTabs from "@/components/dashboard/MessagesPageTabs";

export default async function MessagesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch user's properties first
  const propertiesRes = await supabase
    .from("properties")
    .select("id, name, city")
    .eq("user_id", user.id)
    .order("name");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = (propertiesRes.data ?? []) as any[];
  const propertyIds = properties.map((p: { id: string }) => p.id);

  // Fetch messages and bookings scoped to user's properties
  const messagesRes = propertyIds.length > 0
    ? await supabase
        .from("messages")
        .select("id, property_id, booking_id, platform, direction, sender_name, content, ai_draft, ai_draft_status, created_at")
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages = (messagesRes.data ?? []) as any[];

  const bookingsRes = propertyIds.length > 0
    ? await supabase
        .from("bookings")
        .select("id, guest_name, check_in, check_out, property_id")
        .in("property_id", propertyIds)
        .order("check_in", { ascending: false })
        .limit(200)
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookingsRes.data ?? []) as any[];

  // Fetch templates scoped to user's properties
  const templatesRes = propertyIds.length > 0
    ? await supabase
        .from("message_templates")
        .select("id, property_id, template_type, subject, body, is_active, trigger_type, trigger_days_offset, trigger_time")
        .in("property_id", propertyIds)
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const templates = (templatesRes.data ?? []) as any[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-neutral-800 mb-1">Messages</h1>
        <p className="text-neutral-500">Unified inbox and message templates</p>
      </div>
      <MessagesPageTabs
        inboxContent={
          <UnifiedInbox messages={messages} properties={properties} bookings={bookings} />
        }
        templatesContent={
          <TemplateManager templates={templates} properties={properties} />
        }
      />
    </div>
  );
}
