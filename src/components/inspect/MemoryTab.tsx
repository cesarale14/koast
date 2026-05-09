"use client";

import type { MemoryEntityGroup } from "@/lib/memory-facts";
import { MemoryEntityGroupSection } from "./MemoryEntityGroup";
import { MemoryEmptyState } from "./MemoryEmptyState";

type Props = {
  groups: MemoryEntityGroup[];
  totalActive: number;
  totalSuperseded: number;
};

export function MemoryTab({ groups, totalActive, totalSuperseded }: Props) {
  if (totalActive === 0 && totalSuperseded === 0) {
    return <MemoryEmptyState />;
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <MemoryEntityGroupSection key={group.entity_type} group={group} />
      ))}
    </div>
  );
}
