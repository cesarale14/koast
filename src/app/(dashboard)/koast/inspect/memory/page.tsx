import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMemoryFacts } from "@/lib/memory-facts";
import { MemoryTab } from "@/components/inspect/MemoryTab";

export default async function MemoryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const result = await listMemoryFacts(supabase, user.id);

  return (
    <MemoryTab
      groups={result.groups}
      totalActive={result.total_active}
      totalSuperseded={result.total_superseded}
    />
  );
}
