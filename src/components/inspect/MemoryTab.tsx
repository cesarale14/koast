"use client";

import type { MemoryEntityGroup } from "@/lib/memory-facts";
import type { VoiceFactPayload } from "@/lib/memory/voice-fact-schema";
import { MemoryEntityGroupSection } from "./MemoryEntityGroup";
import { MemoryEmptyState } from "./MemoryEmptyState";
import { MemoryVoiceSection } from "./MemoryVoiceSection";

type Props = {
  groups: MemoryEntityGroup[];
  totalActive: number;
  totalSuperseded: number;
  // M10 Phase D STEP 9 (S4): voice fact fetched separately at memory page
  // route via readVoiceMode (ultraplan §13.2 (b) — listMemoryFacts humanizes
  // display_value; raw VoiceFactPayload needs parallel fetch). Voice facts
  // are filtered OUT of `groups` in listMemoryFacts to avoid double-render.
  voicePayload: VoiceFactPayload | null;
};

export function MemoryTab({ groups, totalActive, totalSuperseded, voicePayload }: Props) {
  // Empty state still covers the "no memory at all" case — but the voice
  // section ALWAYS renders (with its own empty state) since voice memory is
  // host-foundational.
  if (totalActive === 0 && totalSuperseded === 0 && voicePayload === null) {
    return <MemoryEmptyState />;
  }

  return (
    <div className="space-y-8">
      <MemoryVoiceSection voicePayload={voicePayload} />
      {groups.map((group) => (
        <MemoryEntityGroupSection key={group.entity_type} group={group} />
      ))}
    </div>
  );
}
