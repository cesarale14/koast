"use client";

function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-neutral-100 rounded-lg ${className ?? ""}`} />;
}

/** Card grid skeleton — 4 stat cards + 2 content cards */
export function CardGridSkeleton() {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Shimmer className="h-7 w-48 mb-2" />
          <Shimmer className="h-4 w-72" />
        </div>
        <Shimmer className="h-10 w-32 rounded-lg" />
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-neutral-0 rounded-xl p-5">
            <Shimmer className="h-3 w-20 mb-3" />
            <Shimmer className="h-8 w-24 mb-1" />
            <Shimmer className="h-3 w-16" />
          </div>
        ))}
      </div>
      {/* Content cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-neutral-0 rounded-xl p-6">
          <Shimmer className="h-5 w-32 mb-4" />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 28 }).map((_, i) => (
              <Shimmer key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="bg-neutral-0 rounded-xl p-6">
          <Shimmer className="h-5 w-28 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Shimmer key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Table skeleton — header + rows */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Shimmer className="h-7 w-40 mb-2" />
          <Shimmer className="h-4 w-64" />
        </div>
        <div className="flex gap-3">
          <Shimmer className="h-10 w-28 rounded-lg" />
          <Shimmer className="h-10 w-28 rounded-lg" />
        </div>
      </div>
      <div className="bg-neutral-0 rounded-xl p-6">
        {/* Table header */}
        <div className="flex gap-4 mb-4 pb-3 border-b border-neutral-100">
          {[1, 2, 3, 4, 5].map((i) => (
            <Shimmer key={i} className="h-3 flex-1" />
          ))}
        </div>
        {/* Table rows */}
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex gap-4 py-2">
              {[1, 2, 3, 4, 5].map((j) => (
                <Shimmer key={j} className="h-5 flex-1 rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Timeline skeleton — for sync log style pages */
export function TimelineSkeleton({ items = 6 }: { items?: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Shimmer className="h-7 w-36 mb-2" />
          <Shimmer className="h-4 w-56" />
        </div>
        <Shimmer className="h-10 w-28 rounded-lg" />
      </div>
      {/* Filter bar */}
      <div className="flex gap-3 mb-6">
        <Shimmer className="h-9 w-32 rounded-lg" />
        <Shimmer className="h-9 w-32 rounded-lg" />
        <Shimmer className="h-9 w-32 rounded-lg" />
      </div>
      {/* Timeline items */}
      <div className="space-y-4">
        {Array.from({ length: items }).map((_, i) => (
          <div key={i} className="bg-neutral-0 rounded-xl p-5 flex gap-4">
            <Shimmer className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5" />
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Shimmer className="h-5 w-24 rounded-full" />
                <Shimmer className="h-4 w-48" />
              </div>
              <Shimmer className="h-3 w-72" />
            </div>
            <Shimmer className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Simple channel cards skeleton */
export function ChannelCardsSkeleton() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Shimmer className="h-7 w-32 mb-2" />
          <Shimmer className="h-4 w-64" />
        </div>
        <div className="flex gap-3">
          <Shimmer className="h-10 w-28 rounded-lg" />
          <Shimmer className="h-10 w-28 rounded-lg" />
        </div>
      </div>
      {/* Info card */}
      <Shimmer className="h-16 w-full rounded-xl mb-6" />
      {/* Channel cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-neutral-0 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Shimmer className="w-11 h-11 rounded-xl" />
              <div>
                <Shimmer className="h-5 w-24 mb-1.5" />
                <Shimmer className="h-3 w-20" />
              </div>
            </div>
            <Shimmer className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
