"use client";

import { Lock, AlertTriangle } from "lucide-react";
import PlatformLogo from "@/components/ui/PlatformLogo";
import type { ReviewListEntry } from "@/lib/reviews/types";

const PREVIEW_LEN = 120;
const STAYCOMMAND_SUFFIX = / - StayCommand$/i;
const KOAST_SUFFIX = / - Koast$/i;

// Render-time cleanup until a settings UI lets hosts override
// properties.name (RDX-4 in REVIEWS_DATA_TRUTH §6).
function cleanPropertyName(name: string): string {
  return (name ?? "").replace(STAYCOMMAND_SUFFIX, "").replace(KOAST_SUFFIX, "").trim();
}

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - then.getTime()) / 86400000);
  if (diffDays < 1) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) {
    const w = Math.floor(diffDays / 7);
    return `${w}w ago`;
  }
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: now.getFullYear() === then.getFullYear() ? undefined : "numeric",
  });
}

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return null;
  const r = Math.round(rating);
  return (
    <span className="font-mono text-[12px]" style={{ color: "var(--golden)" }}>
      {"★".repeat(Math.max(0, Math.min(5, r)))}
      <span style={{ color: "var(--shell)" }}>{"☆".repeat(Math.max(0, 5 - r))}</span>
    </span>
  );
}

function statusBadge(review: ReviewListEntry): React.ReactNode {
  if (review.response_sent) {
    return (
      <span
        className="text-[10px] font-semibold px-2 py-0.5"
        style={{ borderRadius: 999, background: "rgba(26,122,90,0.1)", color: "var(--lagoon)" }}
      >
        Responded
      </span>
    );
  }
  if (review.response_draft) {
    return (
      <span
        className="text-[10px] font-semibold px-2 py-0.5"
        style={{ borderRadius: 999, background: "rgba(42,90,138,0.12)", color: "var(--deep-water)" }}
      >
        Response ready
      </span>
    );
  }
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5"
      style={{ borderRadius: 999, background: "rgba(212,150,11,0.1)", color: "var(--amber-tide)" }}
    >
      Needs response
    </span>
  );
}

interface ReviewListItemProps {
  review: ReviewListEntry;
  showProperty: boolean;
  animationDelayMs?: number;
  mounted: boolean;
  onOpen: (id: string) => void;
}

export default function ReviewListItem({
  review,
  showProperty,
  animationDelayMs = 0,
  mounted,
  onOpen,
}: ReviewListItemProps) {
  const text = review.incoming_text ?? "";
  const truncated = text.length > PREVIEW_LEN;
  const preview = truncated ? text.slice(0, PREVIEW_LEN).trimEnd() + "…" : text;
  const isBad = review.is_bad_review;
  const propertyLabel = cleanPropertyName(review.property_name);

  return (
    <button
      type="button"
      onClick={() => onOpen(review.id)}
      className={`group w-full text-left bg-white px-4 py-3 flex items-start gap-3 transition-colors hover:bg-shore ${mounted ? "animate-cardReveal" : "opacity-0"}`}
      style={{
        borderRadius: 14,
        boxShadow: "var(--shadow-card)",
        borderLeft: isBad ? "3px solid var(--coral-reef)" : "3px solid transparent",
        opacity: review.response_sent ? 0.85 : 1,
        animationDelay: `${animationDelayMs}ms`,
      }}
    >
      {/* Channel badge */}
      <div className="flex-shrink-0 mt-0.5">
        <PlatformLogo platform={review.platform} size="sm" />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        {/* Row 1: name · property (when 'all') · date */}
        <div className="flex items-center gap-2 text-[12px] mb-0.5" style={{ color: "var(--tideline)" }}>
          <span className="font-semibold truncate" style={{ color: "var(--coastal)", maxWidth: "60%" }}>
            {review.display_guest_name}
          </span>
          {showProperty && propertyLabel && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{propertyLabel}</span>
            </>
          )}
          {review.incoming_date && (
            <>
              <span aria-hidden>·</span>
              <span>{relativeDate(review.incoming_date)}</span>
            </>
          )}
        </div>

        {/* Row 2: text preview */}
        {preview ? (
          <p className="text-[13px] leading-snug line-clamp-2" style={{ color: "var(--coastal)" }}>
            {preview}
          </p>
        ) : (
          <p className="text-[13px] italic" style={{ color: "var(--shell)" }}>
            No written review
          </p>
        )}

        {/* Row 3: meta — rating + badges */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <Stars rating={review.incoming_rating} />
          {review.incoming_rating != null && (
            <span className="text-[11px] font-semibold" style={{ color: "var(--tideline)" }}>
              {review.incoming_rating.toFixed(1)}
            </span>
          )}
          {statusBadge(review)}
          {isBad && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5"
              style={{ borderRadius: 999, background: "rgba(196,64,64,0.08)", color: "var(--coral-reef)" }}
            >
              <AlertTriangle size={10} /> Bad review
            </span>
          )}
          {review.private_feedback && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5"
              style={{ borderRadius: 999, background: "rgba(212,150,11,0.08)", color: "var(--amber-tide)" }}
            >
              <Lock size={10} /> Private
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
