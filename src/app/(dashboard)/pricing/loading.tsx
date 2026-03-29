import { SkeletonCard, Skeleton } from "@/components/ui/Skeleton";

export default function PricingLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="skeleton h-6 w-40 mb-2" />
          <div className="skeleton h-4 w-56" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      {/* Heatmap skeleton */}
      <div className="rounded-lg border border-[var(--border)] bg-neutral-0 p-6">
        <div className="skeleton h-5 w-32 mb-4" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
