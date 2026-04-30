import { Skeleton } from "@/components/ui/Skeleton";

export default function PropertyDetailLoading() {
  return (
    <div className="pb-12">
      {/* Hero placeholder — matches the 280px hero in PropertyDetail */}
      <div
        style={{
          height: 280,
          width: "100%",
          background: "linear-gradient(135deg, var(--deep-sea), var(--abyss) 50%, var(--abyss))",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 32,
            bottom: 28,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>

      <div className="max-w-[1760px] mx-auto px-10">
        {/* Tab strip placeholder */}
        <div className="flex justify-center mt-6">
          <Skeleton className="h-9 w-72 rounded-full" />
        </div>

        {/* Status banner placeholder */}
        <div
          className="mt-6 rounded-2xl p-4"
          style={{ background: "#fff", boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex items-center gap-4">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>

        {/* 5-up stats grid placeholder */}
        <div
          className="grid gap-3 mt-6"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl p-5"
              style={{
                background:
                  "linear-gradient(165deg, rgba(255,255,255,0.95), rgba(247,243,236,0.85) 50%, rgba(237,231,219,0.7))",
                border: "1px solid rgba(255,255,255,0.6)",
                boxShadow: "var(--shadow-glass)",
              }}
            >
              <Skeleton className="h-7 w-20 mb-2" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>

        {/* Two-column UpcomingBookings + ChannelPerformance placeholder */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 mt-6">
          <div>
            <Skeleton className="h-3 w-32 mb-3" />
            <div
              className="rounded-2xl bg-white p-4 space-y-3"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </div>
          <div>
            <Skeleton className="h-3 w-36 mb-3" />
            <div
              className="rounded-2xl bg-white p-5 space-y-4"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-3 flex-1" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
