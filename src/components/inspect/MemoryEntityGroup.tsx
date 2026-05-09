import type { MemoryEntityGroup } from "@/lib/memory-facts";
import { MemoryEntityCard } from "./MemoryEntity";

export function MemoryEntityGroupSection({
  group,
}: {
  group: MemoryEntityGroup;
}) {
  return (
    <section>
      <h2
        className="text-[11px] font-bold tracking-[0.08em] text-[var(--golden)] mb-3"
        aria-label={group.entity_type_label}
      >
        {group.entity_type_label}
      </h2>
      <div className="space-y-4">
        {group.entities.map((entity) => (
          <MemoryEntityCard key={entity.entity_id} entity={entity} />
        ))}
      </div>
    </section>
  );
}
