"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, AlertTriangle, Home, Pencil } from "lucide-react";
import PlatformLogo from "@/components/ui/PlatformLogo";
import { useToast } from "@/components/ui/Toast";
import { isPlatformFallbackName } from "@/lib/guest-name";
import type { ReviewListEntry } from "@/lib/reviews/types";

const PREVIEW_LEN = 120;
// BR1 — keep these regex literals on the legacy brand spelling
// "StayCommand" intact. The const name has been renamed to
// LEGACY_BRAND_SUFFIX, but the literal must stay: Channex's
// `properties.attributes.title` still contains
// "Villa Jamaica - StayCommand" verbatim from pre-rebrand onboarding,
// and this regex is the render-time stripper that hides the legacy
// brand from the host until a settings UI lets them rewrite the
// canonical name. Phase E backfilled the DB but this stays as
// belt-and-suspenders for any rows that slip through pre-strip.
const LEGACY_BRAND_SUFFIX = / - StayCommand$/i;
const KOAST_SUFFIX = / - Koast$/i;

function cleanPropertyName(name: string): string {
  return (name ?? "").replace(LEGACY_BRAND_SUFFIX, "").replace(KOAST_SUFFIX, "").trim();
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
        Draft ready
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
  onRefresh: () => void;
}

// Session 6.7d — inline guest-name editor. Renders next to whichever
// guest-name slot is visible (row 1 in single-property view, row 1b in
// the all-properties "showProperty" view). Pencil affordance is
// prominent when the rendered name is a platform fallback (host needs
// to recover the identity for pre-OAuth iCal-cohort reviews per
// Andrew@Channex Apr 28), subordinate when a real name resolved.
function GuestNameInlineEditor({
  reviewId,
  displayName,
  initialOverride,
  isFallback,
  onRefresh,
  className,
  style,
}: {
  reviewId: string;
  displayName: string;
  initialOverride: string | null;
  isFallback: boolean;
  onRefresh: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialOverride ?? "");
  const [optimisticName, setOptimisticName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(initialOverride ?? "");
  }, [initialOverride]);

  const save = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    const next = trimmed === "" ? null : trimmed;
    // No-op when nothing changed.
    if (next === (initialOverride ?? null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setEditing(false);
    // Optimistic flip — show the new override (or revert to displayName
    // when clearing and we don't yet know the post-clear fallback).
    const optimistic = next ?? displayName;
    setOptimisticName(optimistic);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/guest-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `Failed (${res.status})`);
      onRefresh();
    } catch (e) {
      setOptimisticName(null);
      setDraft(initialOverride ?? "");
      toast(e instanceof Error ? e.message : "Failed to save name", "error");
    } finally {
      setSaving(false);
    }
  }, [reviewId, initialOverride, displayName, onRefresh, toast]);

  const rendered = optimisticName ?? displayName;

  if (editing) {
    return (
      <span
        className={className}
        style={style}
        // Stop row click while editing.
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => save(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save(draft);
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          placeholder="Guest name…"
          maxLength={50}
          className="px-1.5 py-0.5 text-[12px]"
          style={{
            border: "1px solid var(--coastal)",
            borderRadius: 6,
            color: "var(--coastal)",
            outline: "none",
            background: "#fff",
            minWidth: 120,
          }}
        />
      </span>
    );
  }

  return (
    <span className={className} style={style}>
      {rendered}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(initialOverride ?? "");
          setEditing(true);
        }}
        disabled={saving}
        aria-label="Edit guest name"
        title={isFallback ? "Set the guest's real name" : "Edit guest name"}
        className="inline-flex items-center justify-center ml-1 align-middle hover:bg-shore"
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          color: isFallback ? "var(--coastal)" : "var(--tideline)",
          opacity: isFallback ? 0.9 : 0.4,
          cursor: saving ? "wait" : "pointer",
        }}
      >
        <Pencil size={10} />
      </button>
    </span>
  );
}

export default function ReviewListItem({
  review,
  showProperty,
  animationDelayMs = 0,
  mounted,
  onOpen,
  onRefresh,
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
  const isFallback = isPlatformFallbackName(review.display_guest_name);

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
            <GuestNameInlineEditor
              reviewId={review.id}
              displayName={review.display_guest_name}
              initialOverride={review.guest_name_override}
              isFallback={isFallback}
              onRefresh={onRefresh}
              className="font-semibold truncate inline-flex items-center"
              style={{ color: "var(--coastal)", maxWidth: "60%" }}
            />
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
          <div className="text-[11px] mb-1 inline-flex items-center" style={{ color: "var(--tideline)" }}>
            <GuestNameInlineEditor
              reviewId={review.id}
              displayName={review.display_guest_name}
              initialOverride={review.guest_name_override}
              isFallback={isFallback}
              onRefresh={onRefresh}
              className="inline-flex items-center"
            />
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
