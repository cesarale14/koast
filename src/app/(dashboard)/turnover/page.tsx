import { createClient } from "@/lib/supabase/server";
import TurnoverBoard from "@/components/dashboard/TurnoverBoard";

export default async function TurnoverPage() {
  const supabase = createClient();

  // Fetch all cleaning tasks with related data
  const { data: tasks } = await supabase
    .from("cleaning_tasks")
    .select("id, property_id, booking_id, next_booking_id, cleaner_id, status, scheduled_date, scheduled_time, checklist, notes, completed_at, cleaner_token, created_at")
    .order("scheduled_date");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTasks = (tasks ?? []) as any[];

  // Fetch properties
  const { data: props } = await supabase.from("properties").select("id, name").order("name");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties = (props ?? []) as any[];

  // Fetch bookings for guest names
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, guest_name, check_in, check_out")
    .order("check_in");
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
