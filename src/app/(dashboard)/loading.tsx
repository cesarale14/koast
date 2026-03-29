import { SkeletonCard, SkeletonText } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div>
      <div className="mb-6">
        <div className="skeleton h-6 w-48 mb-2" />
        <div className="skeleton h-4 w-64" />
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      {/* Chart area */}
      <div className="rounded-lg border border-[var(--border)] bg-neutral-0 p-6">
        <div className="skeleton h-5 w-40 mb-4" />
        <div className="skeleton h-64 w-full" />
      </div>
      {/* Activity */}
      <div className="mt-6">
        <SkeletonText lines={5} />
      </div>
    </div>
  );
}
