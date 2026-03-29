import { SkeletonCard } from "@/components/ui/Skeleton";

export default function PropertiesLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="skeleton h-6 w-32 mb-2" />
          <div className="skeleton h-4 w-48" />
        </div>
        <div className="skeleton h-9 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <SkeletonCard className="h-48" />
        <SkeletonCard className="h-48" />
        <SkeletonCard className="h-48" />
      </div>
    </div>
  );
}
