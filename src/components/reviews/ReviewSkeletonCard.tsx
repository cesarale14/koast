import { Skeleton } from "@/components/ui/Skeleton";

export default function ReviewSkeletonCard() {
  return (
    <div
      className="bg-white p-5"
      style={{ borderRadius: 16, boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="flex-1 min-w-0">
          <Skeleton className="h-4 w-32 mb-1.5" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-3 w-full mb-2" />
      <Skeleton className="h-3 w-[92%] mb-2" />
      <Skeleton className="h-3 w-[64%] mb-4" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
    </div>
  );
}
