import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  listAuditFeedEvents,
  type AuditFeedFilter,
} from "@/lib/audit-feed";
import { ActivityTab } from "@/components/inspect/ActivityTab";

const VALID_FILTERS: ReadonlySet<AuditFeedFilter> = new Set([
  "all",
  "memory",
  "messages",
  "pricing",
  "sms",
]);

const INITIAL_LIMIT = 50;

type SearchParams = { filter?: string };

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const filterParam = (searchParams.filter ?? "all").toLowerCase();
  const initialFilter: AuditFeedFilter = VALID_FILTERS.has(
    filterParam as AuditFeedFilter,
  )
    ? (filterParam as AuditFeedFilter)
    : "all";

  const initial = await listAuditFeedEvents(supabase, user.id, {
    filter: initialFilter,
    limit: INITIAL_LIMIT,
  });

  return (
    <ActivityTab
      initialFilter={initialFilter}
      initialEvents={initial.events}
      initialNextCursor={initial.next_cursor}
    />
  );
}
