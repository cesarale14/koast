import type { MemoryEntity } from "@/lib/memory-facts";
import { MemoryFactRow } from "./MemoryFact";

export function MemoryEntityCard({ entity }: { entity: MemoryEntity }) {
  const factCount = entity.facts.length;

  return (
    <article className="rounded-[12px] border border-[var(--hairline)] bg-white">
      <header className="flex items-baseline justify-between px-5 pt-4 pb-2">
        <h3 className="text-[15px] font-semibold text-[var(--coastal)]">
          {entity.entity_name}
        </h3>
        <span className="text-[12px] text-[var(--tideline)]">
          {factCount === 1 ? "1 fact" : `${factCount} facts`}
        </span>
      </header>
      <div>
        {entity.facts.map((fact) => (
          <MemoryFactRow key={fact.id} fact={fact} />
        ))}
      </div>
    </article>
  );
}
