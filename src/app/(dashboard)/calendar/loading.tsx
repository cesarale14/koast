import { Skeleton } from "@/components/ui/Skeleton";

export default function CalendarLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="skeleton h-6 w-32 mb-2" />
          <div className="skeleton h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-9 w-20 rounded-lg" />
          <div className="skeleton h-9 w-20 rounded-lg" />
          <div className="skeleton h-9 w-20 rounded-lg" />
        </div>
      </div>
      <div className="rounded-lg border border-[var(--border)] overflow-hidden">
        {/* Header row */}
        <div className="flex border-b border-[var(--border)]">
          <div className="w-44 flex-shrink-0 bg-neutral-50 border-r border-[var(--border)] px-4 py-3">
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="flex-1 flex gap-0">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="w-[80px] flex-shrink-0 text-center py-2 border-r border-neutral-100">
                <Skeleton className="h-2 w-6 mx-auto mb-1" />
                <Skeleton className="h-4 w-4 mx-auto" />
              </div>
            ))}
          </div>
        </div>
        {/* Property rows */}
        {Array.from({ length: 3 }).map((_, r) => (
          <div key={r} className="flex border-b border-neutral-100">
            <div className="w-44 flex-shrink-0 border-r border-[var(--border)] px-4 py-4">
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="flex-1">
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
