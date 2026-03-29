import { createClient } from "@/lib/supabase/server";
import TurnoverBoard from "@/components/dashboard/TurnoverBoard";

export default async function TurnoverPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch user's properties first
  const { data: props } = await supabase
    .from("properties")
    .select("id, name")
    .eq("user_id", user.id)
    .order("name");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = (props ?? []) as any[];
  const propertyIds = properties.map((p: { id: string }) => p.id);

  // Fetch cleaning tasks and bookings scoped to user's properties
  const { data: tasks } = propertyIds.length > 0
    ? await supabase
        .from("cleaning_tasks")
        .select("id, property_id, booking_id, next_booking_id, cleaner_id, status, scheduled_date, scheduled_time, checklist, notes, completed_at, cleaner_token, created_at")
        .in("property_id", propertyIds)
        .order("scheduled_date")
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTasks = (tasks ?? []) as any[];

  const { data: bookings } = propertyIds.length > 0
    ? await supabase
        .from("bookings")
        .select("id, guest_name, check_in, check_out")
        .in("property_id", propertyIds)
        .order("check_in")
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allBookings = (bookings ?? []) as any[];

  return (
    <TurnoverBoard
      tasks={allTasks}
      properties={properties}
      bookings={allBookings}
    />
  );
}
