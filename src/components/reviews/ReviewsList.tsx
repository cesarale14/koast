"use client";

import ReviewListItem from "./ReviewListItem";
import type { ReviewListEntry } from "@/lib/reviews/types";

interface ReviewsListProps {
  reviews: ReviewListEntry[];
  showProperty: boolean;
  mounted: boolean;
  onOpen: (id: string) => void;
}

export default function ReviewsList({ reviews, showProperty, mounted, onOpen }: ReviewsListProps) {
  return (
    <div className="space-y-2">
      {reviews.map((r, i) => (
        <ReviewListItem
          key={r.id}
          review={r}
          showProperty={showProperty}
          mounted={mounted}
          animationDelayMs={i * 30}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

// Skeleton row used by the page during initial load.
export function ReviewsListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="bg-white px-4 py-3 flex items-start gap-3"
          style={{ borderRadius: 14, boxShadow: "var(--shadow-card)" }}
        >
          <div className="w-6 h-6 rounded-full" style={{ background: "var(--shore)" }} />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3" style={{ background: "var(--dry-sand)", borderRadius: 4 }} />
            <div className="h-3 w-full" style={{ background: "var(--shore)", borderRadius: 4 }} />
            <div className="h-3 w-2/3" style={{ background: "var(--shore)", borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
