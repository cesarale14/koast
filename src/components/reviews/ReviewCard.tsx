"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import PlatformLogo from "@/components/ui/PlatformLogo";
import { Lock, AlertTriangle, MoreVertical, CheckCircle2, Pencil } from "lucide-react";
import ReviewReplyPanel from "./ReviewReplyPanel";
import GuestReviewForm from "./GuestReviewForm";

export interface ReviewCardModel {
  id: string;
  property_id: string;
  property_name: string;
  channex_review_id: string | null;
  guest_name: string | null;
  guest_name_override: string | null;
  display_guest_name: string;
  guest_review_submitted_at: string | null;
  guest_review_channex_acked_at: string | null;
  guest_review_airbnb_confirmed_at: string | null;
  incoming_text: string | null;
  incoming_rating: number | null;
  incoming_date: string | null;
  private_feedback: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subratings: any;
  response_draft: string | null;
  response_sent: boolean;
  status: string | null;
  is_bad_review: boolean;
  platform: string;
  booking_check_in: string | null;
  booking_check_out: string | null;
  booking_nights: number | null;
  booking_platform_booking_id: string | null;
}

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - then.getTime()) / 86400000);
  if (diffDays < 1) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const w = Math.floor(diffDays / 7);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric", year: now.getFullYear() === then.getFullYear() ? undefined : "numeric" });
}

function Stars({ rating, isBad }: { rating: number | null; isBad: boolean }) {
  if (rating == null) return null;
  const rounded = Math.round(rating);
  const color = isBad ? "var(--coral-reef)" : "var(--golden)";
  return (
    <span className="inline-flex items-center gap-1" style={{ color }}>
      <span className="font-mono text-[13px]">{"★".repeat(Math.max(0, Math.min(5, rounded)))}{"☆".repeat(Math.max(0, 5 - rounded))}</span>
      <span className="text-[11px] font-semibold" style={{ color: "var(--tideline)" }}>{rating.toFixed(1)}</span>
    </span>
  );
}

function StatusBadge({ review }: { review: ReviewCardModel }) {
  if (review.response_sent) {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(26,122,90,0.1)", color: "var(--lagoon)" }}>
        Responded
      </span>
    );
  }
  if (review.response_draft) {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(42,90,138,0.12)", color: "var(--deep-water)" }}>
        Response ready
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(212,150,11,0.1)", color: "var(--amber-tide)" }}>
      Needs response
    </span>
  );
}

function Avatar({ name, isBad }: { name: string | null; isBad: boolean }) {
  const initial = (name ?? "?").charAt(0).toUpperCase();
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center text-[12px] font-bold"
      style={{
        width: 34,
        height: 34,
        borderRadius: 999,
        background: isBad ? "rgba(196,64,64,0.12)" : "var(--shore)",
        color: isBad ? "var(--coral-reef)" : "var(--coastal)",
      }}
    >
      {initial}
    </div>
  );
}

interface ReviewCardProps {
  review: ReviewCardModel;
  animationDelayMs?: number;
  mounted: boolean;
  onRefresh: () => void;
}

export default function ReviewCard({ review, animationDelayMs = 0, mounted, onRefresh }: ReviewCardProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [guestReviewOpen, setGuestReviewOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [markingBad, setMarkingBad] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(review.guest_name_override ?? "");
  const [optimisticName, setOptimisticName] = useState<string | null>(null);

  const rating = review.incoming_rating;
  const isBad = review.is_bad_review || (rating != null && rating < 4);
  const name = optimisticName ?? review.display_guest_name;
  // Treat a name as "fallback / muted" when the resolver had to
  // synthesize a platform-tagged label rather than surface a real one.
  // An override always counts as a real name.
  const isFallbackName =
    !review.guest_name_override &&
    optimisticName == null &&
    (!review.guest_name || review.guest_name === "Airbnb Guest");

  const saveName = async (raw: string) => {
    const next = raw.trim();
    setEditingName(false);
    setOptimisticName(next === "" ? null : next);
    try {
      const res = await fetch(`/api/reviews/${review.id}/guest-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? `Failed (${res.status})`);
      onRefresh();
    } catch (e) {
      setOptimisticName(null);
      toast(e instanceof Error ? e.message : "Failed to save name", "error");
    }
  };

  const PREVIEW_LEN = 200;
  const fullText = review.incoming_text ?? "";
  const truncated = fullText.length > PREVIEW_LEN && !expanded;
  const shownText = truncated ? fullText.slice(0, PREVIEW_LEN).trimEnd() + "…" : fullText;

  const markBad = async () => {
    setMarkingBad(true);
    try {
      // /api/reviews/approve sets is_bad_review + draft_generated status.
      // For incoming reviews we only want the bad-review flag; reuse the
      // same route with is_bad_review=true and no final_text.
      const res = await fetch(`/api/reviews/approve/${review.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_bad_review: true }),
      });
      const p = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(p.error ?? `Failed (${res.status})`);
      toast("Marked as bad review");
      onRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setMarkingBad(false);
      setMenuOpen(false);
    }
  };

  const copyText = async () => {
    if (!review.incoming_text) return;
    try {
      await navigator.clipboard.writeText(review.incoming_text);
      toast("Review text copied");
    } catch {
      toast("Couldn't copy", "error");
    }
    setMenuOpen(false);
  };

  return (
    <div
      className={`group bg-white p-5 relative ${mounted ? "animate-cardReveal" : "opacity-0"}`}
      style={{
        borderRadius: 16,
        boxShadow: "var(--shadow-card)",
        borderLeft: isBad ? "4px solid var(--coral-reef)" : undefined,
        opacity: review.response_sent ? 0.82 : 1,
        animationDelay: `${animationDelayMs}ms`,
      }}
    >
      {/* Row 1 — header */}
      <div className="flex items-center gap-3 mb-3">
        <Avatar name={review.guest_name} isBad={isBad} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {editingName ? (
              <input
                type="text"
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => saveName(nameDraft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveName(nameDraft);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setNameDraft(review.guest_name_override ?? "");
                    setEditingName(false);
                  }
                }}
                placeholder="Guest name…"
                maxLength={200}
                className="px-2 py-0.5 text-[14px] font-semibold rounded"
                style={{
                  border: "1px solid var(--dry-sand)",
                  color: "var(--coastal)",
                  outline: "none",
                  width: "min(220px, 60%)",
                }}
              />
            ) : (
              <span
                className="text-[14px] font-semibold truncate"
                style={{ color: isFallbackName ? "var(--tideline)" : "var(--coastal)" }}
              >
                {name}
              </span>
            )}
            {!review.response_sent && !editingName && (
              <button
                type="button"
                onClick={() => {
                  setNameDraft(review.guest_name_override ?? "");
                  setEditingName(true);
                }}
                aria-label="Edit guest name"
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-shore"
                style={{ color: "var(--tideline)" }}
              >
                <Pencil size={12} />
              </button>
            )}
            <PlatformLogo platform={review.platform} size="sm" />
          </div>
          <div className="text-[12px] flex items-center gap-2" style={{ color: "var(--tideline)" }}>
            <span>{review.property_name}</span>
            {review.incoming_date && (
              <>
                <span>·</span>
                <span>{relativeDate(review.incoming_date)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Stars rating={rating} isBad={isBad} />
          <StatusBadge review={review} />
        </div>
      </div>

      {/* Row 2 — content */}
      {fullText ? (
        <p className="text-[13px] leading-relaxed mb-3 whitespace-pre-wrap" style={{ color: "var(--coastal)" }}>
          {shownText}
          {truncated && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="ml-1 text-[12px] font-semibold"
              style={{ color: "var(--golden)" }}
            >
              Read more
            </button>
          )}
          {expanded && fullText.length > PREVIEW_LEN && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="ml-1 text-[12px] font-semibold"
              style={{ color: "var(--golden)" }}
            >
              Show less
            </button>
          )}
        </p>
      ) : (
        <p className="text-[13px] italic mb-3" style={{ color: "var(--shell)" }}>
          No written review
        </p>
      )}

      {/* Row 3 — markers */}
      {(isBad || review.private_feedback) && (
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {isBad && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--coral-reef)" }}>
              <AlertTriangle size={12} /> Bad review
            </span>
          )}
          {review.private_feedback && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--amber-tide)" }}>
              <Lock size={12} /> Private feedback included
            </span>
          )}
        </div>
      )}

      {/* Row 4 — actions */}
      {!review.response_sent && !replyOpen && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReplyOpen(true)}
            className="px-4 py-2 text-[12px] font-semibold transition-colors hover:opacity-90"
            style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
          >
            Reply to guest
          </button>
          {review.platform === "airbnb" && (
            (() => {
              if (review.guest_review_airbnb_confirmed_at) {
                return (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold"
                    style={{ background: "rgba(26,122,90,0.1)", color: "var(--lagoon)", borderRadius: 10 }}
                  >
                    <CheckCircle2 size={12} /> Guest reviewed
                  </span>
                );
              }
              if (review.guest_review_submitted_at) {
                return (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold"
                    title="Submitted to Channex. Awaiting Airbnb confirmation."
                    style={{ background: "rgba(212,150,11,0.1)", color: "var(--amber-tide)", borderRadius: 10 }}
                  >
                    Submitted, pending
                  </span>
                );
              }
              if (!review.channex_review_id) {
                return (
                  <button
                    type="button"
                    disabled
                    title="Cannot submit — review predates Channex sync"
                    className="px-4 py-2 text-[12px] font-medium cursor-not-allowed"
                    style={{ background: "#fff", border: "1px solid var(--dry-sand)", color: "var(--shell)", borderRadius: 10 }}
                  >
                    Review this guest
                  </button>
                );
              }
              return (
                <button
                  type="button"
                  onClick={() => setGuestReviewOpen(true)}
                  className="px-4 py-2 text-[12px] font-semibold transition-colors"
                  style={{ background: "#fff", border: "1px solid var(--coastal)", color: "var(--coastal)", borderRadius: 10 }}
                >
                  Review this guest
                </button>
              );
            })()
          )}
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
              className="p-2 rounded-lg hover:bg-shore"
              style={{ color: "var(--tideline)" }}
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 mt-1 py-1 bg-white z-10"
                style={{ borderRadius: 10, border: "1px solid var(--dry-sand)", minWidth: 200, boxShadow: "var(--shadow-card)" }}
              >
                <button
                  type="button"
                  onClick={markBad}
                  disabled={markingBad || review.is_bad_review}
                  className="block w-full text-left px-3 py-2 text-[12px] hover:bg-shore disabled:opacity-50"
                  style={{ color: "var(--coastal)" }}
                >
                  {review.is_bad_review ? "Already flagged as bad" : "Mark as bad review"}
                </button>
                <button
                  type="button"
                  onClick={copyText}
                  disabled={!review.incoming_text}
                  className="block w-full text-left px-3 py-2 text-[12px] hover:bg-shore disabled:opacity-50"
                  style={{ color: "var(--coastal)" }}
                >
                  Copy review text
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {replyOpen && (
        <ReviewReplyPanel review={review} onClose={() => setReplyOpen(false)} onUpdated={onRefresh} />
      )}

      {guestReviewOpen && (
        <GuestReviewForm
          review={review}
          onClose={() => setGuestReviewOpen(false)}
          onSubmitted={onRefresh}
        />
      )}
    </div>
  );
}
