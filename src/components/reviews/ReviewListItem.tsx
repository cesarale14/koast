"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, AlertTriangle, Home } from "lucide-react";
import PlatformLogo from "@/components/ui/PlatformLogo";
import type { ReviewListEntry } from "@/lib/reviews/types";

const PREVIEW_LEN = 120;
const STAYCOMMAND_SUFFIX = / - StayCommand$/i;
const KOAST_SUFFIX = / - Koast$/i;

// Render-time cleanup until a settings UI lets hosts override
// properties.name. Phase E backfilled the DB but this stays as
// belt-and-suspenders for any rows that slip through pre-strip.
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
  // Session 6.7 — pre-disclosure state takes precedence. Channex sets
  // is_hidden=true while the 14-day mutual-disclosure window is open.
  // The host can't yet read the review, can't yet respond — but they
  // CAN submit their host-side review of the guest, which is what the
  // "Submit guest review" surface is for.
  if (review.is_hidden) {
    return (
      <span
        className="text-[10px] font-semibold px-2 py-0.5"
        style={{ borderRadius: 999, background: "rgba(196,154,90,0.1)", color: "var(--golden)" }}
      >
        Awaiting guest review
      </span>
    );
  }
  if (review.response_sent) {
    return (
      <span
        className="text-[10px] font-semibold px-2 py-0.5"
        style={{ borderRadius: 999, background: "rgba(26,122,90,0.1)", color: "var(--lagoon)" }}
      >
        Replied
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
      Needs reply
    </span>
  );
}

// Session 6.7 — disclosure-window helper for the pre-disclosure UI.
function formatDisclosureDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const AVATAR_SIZE = 44;

function PropertyAvatar({
  photoUrl,
  propertyId,
  alt,
}: {
  photoUrl: string | null;
  propertyId: string;
  alt: string;
}) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);
  const showFallback = !photoUrl || imgError;
  return (
    <button
      type="button"
      // Stop propagation so the row click (which opens the slide-over)
      // doesn't also fire when the host taps the avatar to navigate.
      onClick={(e) => {
        e.stopPropagation();
        router.push(`/properties/${propertyId}`);
      }}
      aria-label={`Open ${alt}`}
      className="flex-shrink-0 mt-0.5 transition-transform hover:scale-105"
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid var(--dry-sand)",
        cursor: "pointer",
        background: "var(--shore)",
      }}
    >
      {showFallback ? (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ color: "var(--tideline)" }}
        >
          <Home size={20} />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl!}
          alt={alt}
          loading="lazy"
          onError={() => setImgError(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </button>
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
  // Session 6.7 — pre-disclosure reviews can never trip the bad-review
  // tag (sync.ts already gates is_low_rating on !is_hidden, but the
  // host-asserted is_flagged_by_host flag could in theory still light
  // up). Treat is_hidden as the hard suppressor for the bad-review
  // affordance.
  const isBad = !review.is_hidden && (review.is_low_rating || review.is_flagged_by_host);
  const disclosureDate = review.is_hidden ? formatDisclosureDate(review.expired_at) : null;
  const propertyLabel = cleanPropertyName(review.property_name);

  const onRowClick = () => onOpen(review.id);
  const onRowKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(review.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onRowClick}
      onKeyDown={onRowKey}
      className={`group bg-white px-4 py-3 flex items-start gap-3 transition-colors hover:bg-shore cursor-pointer ${mounted ? "animate-cardReveal" : "opacity-0"}`}
      style={{
        borderRadius: 14,
        boxShadow: "var(--shadow-card)",
        borderLeft: isBad ? "3px solid var(--coral-reef)" : "3px solid transparent",
        opacity: review.response_sent ? 0.85 : 1,
        animationDelay: `${animationDelayMs}ms`,
      }}
    >
      {/* RDX-5 — avatar = property photo. Click navigates to /properties/[id]. */}
      <PropertyAvatar
        photoUrl={review.property_cover_photo_url}
        propertyId={review.property_id}
        alt={propertyLabel || "Property"}
      />

      {/* Body */}
      <div className="flex-1 min-w-0">
        {/* Row 1: channel logo + property name (when 'all') OR guest name + date */}
        <div className="flex items-center gap-2 text-[12px] mb-0.5" style={{ color: "var(--tideline)" }}>
          <span className="inline-flex items-center" style={{ flexShrink: 0 }}>
            <PlatformLogo platform={review.platform} size="sm" />
          </span>
          {showProperty && propertyLabel ? (
            <span className="font-semibold truncate" style={{ color: "var(--coastal)" }}>
              {propertyLabel}
            </span>
          ) : (
            <span className="font-semibold truncate" style={{ color: "var(--coastal)", maxWidth: "60%" }}>
              {review.display_guest_name}
            </span>
          )}
          {review.incoming_date && (
            <>
              <span aria-hidden>·</span>
              <span>{relativeDate(review.incoming_date)}</span>
            </>
          )}
        </div>

        {/* Row 1b: guest name when 'all' (otherwise rendered above) */}
        {showProperty && propertyLabel && (
          <div className="text-[11px] mb-1" style={{ color: "var(--tideline)" }}>
            {review.display_guest_name}
          </div>
        )}

        {/* Row 2: text preview — pre-disclosure reviews show a
            disclosure-window message instead of the empty body. */}
        {review.is_hidden ? (
          <p className="text-[13px] italic" style={{ color: "var(--tideline)" }}>
            Guest&apos;s review is hidden until you submit yours
            {disclosureDate ? ` or the disclosure window closes on ${disclosureDate}` : ""}.
          </p>
        ) : preview ? (
          <p className="text-[13px] leading-snug line-clamp-2" style={{ color: "var(--coastal)" }}>
            {preview}
          </p>
        ) : (
          <p className="text-[13px] italic" style={{ color: "var(--shell)" }}>
            No written review
          </p>
        )}

        {/* Row 3: meta — rating + badges. Pre-disclosure reviews mute
            stars (no rating to show yet) and skip the bad-review tag. */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {!review.is_hidden && <Stars rating={review.incoming_rating} />}
          {!review.is_hidden && review.incoming_rating != null && (
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
    </div>
  );
}
