import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import UnifiedInbox from "@/components/dashboard/UnifiedInbox";
import TemplateManager from "@/components/dashboard/TemplateManager";
import MessagesPageTabs from "@/components/dashboard/MessagesPageTabs";
import EmptyState from "@/components/ui/EmptyState";
import { MessageCircle } from "lucide-react";

export default async function MessagesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const svc = createServiceClient();

  const propertiesRes = await svc
    .from("properties")
    .select("id, name, city, state, cover_photo_url")
    .eq("user_id", user.id)
    .order("name");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = (propertiesRes.data ?? []) as any[];
  const propertyIds = properties.map((p: { id: string }) => p.id);

  const messagesRes = propertyIds.length > 0
    ? await svc
        .from("messages")
        .select(
          "id, property_id, booking_id, platform, direction, sender_name, content, ai_draft, ai_draft_status, created_at"
        )
        .in("property_id", propertyIds)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages = (messagesRes.data ?? []) as any[];

  const bookingsRes = propertyIds.length > 0
    ? await svc
        .from("bookings")
        .select("id, guest_name, check_in, check_out, property_id, total_price, num_guests")
        .in("property_id", propertyIds)
        .order("check_in", { ascending: false })
        .limit(200)
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookingsRes.data ?? []) as any[];

  const templatesRes = propertyIds.length > 0
    ? await svc
        .from("message_templates")
        .select(
          "id, property_id, template_type, subject, body, is_active, trigger_type, trigger_days_offset, trigger_time"
        )
        .in("property_id", propertyIds)
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const templates = (templatesRes.data ?? []) as any[];

  if (properties.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto p-8">
        <EmptyState
          icon={MessageCircle}
          title="No messages yet"
          description="Messages will appear here when guests contact you through connected channels."
          action={{ label: "Add a Property", href: "/properties" }}
        />
      </div>
    );
  }

  return (
    <MessagesPageTabs
      inboxContent={
        <UnifiedInbox messages={messages} properties={properties} bookings={bookings} />
      }
      templatesContent={<TemplateManager templates={templates} properties={properties} />}
    />
  );
}
