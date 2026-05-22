import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMemoryFacts } from "@/lib/memory-facts";
import { readVoiceMode } from "@/lib/memory/voice-mode";
import { MemoryTab } from "@/components/inspect/MemoryTab";

export default async function MemoryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // M10 Phase D STEP 9 (S4): voice fact fetched in parallel with generic
  // memory facts (ultraplan §13.2 (b) — listMemoryFacts humanizes
  // display_value, so the raw VoiceFactPayload needs a separate fetch).
  // Voice rows are filtered OUT of listMemoryFacts groups to avoid
  // double-rendering them in both the dedicated section and the host group.
  const [result, voicePayload] = await Promise.all([
    listMemoryFacts(supabase, user.id),
    readVoiceMode(supabase, user.id),
  ]);

  return (
    <MemoryTab
      groups={result.groups}
      totalActive={result.total_active}
      totalSuperseded={result.total_superseded}
      voicePayload={voicePayload}
    />
  );
}
