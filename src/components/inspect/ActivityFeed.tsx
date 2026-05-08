"use client";

import { useEffect, useRef } from "react";
import type { AuditEvent, AuditFeedFilter } from "@/lib/audit-feed";
import { ActivityEvent } from "./ActivityEvent";
import { ActivityEmptyState } from "./ActivityEmptyState";

type Props = {
  filter: AuditFeedFilter;
  events: AuditEvent[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  onLoadMore: () => void;
};

export function ActivityFeed({
  filter,
  events,
  nextCursor,
  loading,
  error,
  onLoadMore,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Infinite scroll: observe the sentinel just past the list bottom.
  // When it intersects, fire onLoadMore() if there's a next cursor.
  useEffect(() => {
    if (!nextCursor || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onLoadMore();
            break;
          }
        }
      },
      { rootMargin: "200px 0px 200px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [nextCursor, loading, onLoadMore]);

  if (events.length === 0 && !loading && !error) {
    return <ActivityEmptyState filter={filter} />;
  }

  return (
    <div>
      <div className="rounded-[12px] border border-[var(--hairline)] bg-white overflow-hidden">
        {events.map((event) => (
          <ActivityEvent
            key={`${event.source_table}:${event.source_id}`}
            event={event}
          />
        ))}
      </div>
      <div
        ref={sentinelRef}
        aria-hidden="true"
        className="h-1"
      />
      {loading && (
        <p
          aria-live="polite"
          className="mt-4 text-center text-[12px] text-[var(--tideline)]"
        >
          Loading more
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 text-center text-[13px] text-[var(--coastal)]"
        >
          {error}
        </p>
      )}
      {!loading && !error && nextCursor === null && events.length > 0 && (
        <p className="mt-4 text-center text-[12px] text-[var(--tideline)]">
          End of activity.
        </p>
      )}
    </div>
  );
}
