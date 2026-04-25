"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  Lock,
  MoreVertical,
  Pencil,
  Sparkles,
  X,
} from "lucide-react";
import PlatformLogo from "@/components/ui/PlatformLogo";
import { useToast } from "@/components/ui/Toast";
import GuestReviewForm from "./GuestReviewForm";
import type { ReviewListEntry } from "@/lib/reviews/types";

interface ReviewSlideOverProps {
  review: ReviewListEntry;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

const SUBRATING_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "clean", label: "Cleanliness" },
  { key: "communication", label: "Communication" },
  { key: "checkin", label: "Check-in" },
  { key: "accuracy", label: "Accuracy" },
  { key: "location", label: "Location" },
  { key: "value", label: "Value" },
];

const CHANNEL_REPLY_RULES: Record<string, string> = {
  airbnb: "Airbnb allows one public reply per review. Edits are not permitted after submission.",
  booking_com: "Booking.com publishes replies on the listing. Profanity filtering may delay or reject the reply.",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function nightsBetween(ci: string | null, co: string | null): number | null {
  if (!ci || !co) return null;
  const a = new Date(ci).getTime();
  const b = new Date(co).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

function SubratingBar({ label, score }: { label: string; score: number | null }) {
  // Channex subratings are 0-10. Normalize to 0-1 for the bar.
  const pct = score != null && Number.isFinite(score) ? Math.max(0, Math.min(1, score / 10)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] flex-shrink-0" style={{ width: 100, color: "var(--tideline)" }}>
        {label}
      </span>
      <div className="flex-1 h-1.5" style={{ background: "var(--shore)", borderRadius: 999 }}>
        <div
          style={{
            width: `${pct * 100}%`,
            height: "100%",
            background: "var(--lagoon)",
            borderRadius: 999,
          }}
        />
      </div>
      <span className="text-[11px] font-semibold w-8 text-right" style={{ color: "var(--coastal)" }}>
        {score != null ? score.toFixed(1) : "—"}
      </span>
    </div>
  );
}

export default function ReviewSlideOver({ review, open, onClose, onRefresh }: ReviewSlideOverProps) {
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [composer, setComposer] = useState(review.response_draft ?? "");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [guestReviewOpen, setGuestReviewOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(review.guest_name_override ?? "");
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Reset composer + name draft when the slide-over opens for a different review.
  useEffect(() => {
    setComposer(review.response_draft ?? "");
    setNameDraft(review.guest_name_override ?? "");
    setEditingName(false);
    setMenuOpen(false);
  }, [review.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc closes; focus the close button when opened.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const subratingMap = useMemo(() => {
    const m = new Map<string, number>();
    if (Array.isArray(review.subratings)) {
      for (const s of review.subratings) {
        if (s && typeof s === "object" && "category" in s && "score" in s) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          m.set(String((s as any).category), Number((s as any).score));
        }
      }
    }
    return m;
  }, [review.subratings]);

  const generateDraft = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/reviews/respond/${review.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `Failed (${res.status})`);
      if (d.response_text) setComposer(d.response_text);
      toast("Draft generated");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Generation failed", "error");
    } finally {
      setGenerating(false);
    }
  }, [review.id, toast]);

  const saveDraft = useCallback(async () => {
    if (!composer.trim()) {
      toast("Nothing to save", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/reviews/respond/${review.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_draft", response_text: composer }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `Failed (${res.status})`);
      toast("Draft saved");
      onRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }, [review.id, composer, toast, onRefresh]);

  const publish = useCallback(async () => {
    if (!composer.trim()) {
      toast("Nothing to publish", "error");
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch(`/api/reviews/respond/${review.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", response_text: composer }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `Failed (${res.status})`);
      toast("Reply published to Channex");
      onRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Publish failed", "error");
    } finally {
      setPublishing(false);
    }
  }, [review.id, composer, toast, onRefresh]);

  const toggleBad = useCallback(async () => {
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/reviews/approve/${review.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_bad_review: !review.is_bad_review }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `Failed (${res.status})`);
      toast(review.is_bad_review ? "Removed bad-review flag" : "Marked as bad review");
      onRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }, [review.id, review.is_bad_review, toast, onRefresh]);

  const copyText = useCallback(async () => {
    setMenuOpen(false);
    if (!review.incoming_text) return;
    try {
      await navigator.clipboard.writeText(review.incoming_text);
      toast("Review text copied");
    } catch {
      toast("Couldn't copy", "error");
    }
  }, [review.incoming_text, toast]);

  const saveName = useCallback(async (raw: string) => {
    const next = raw.trim();
    setEditingName(false);
    try {
      const res = await fetch(`/api/reviews/${review.id}/guest-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `Failed (${res.status})`);
      onRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save name", "error");
    }
  }, [review.id, toast, onRefresh]);

  if (!open || !mounted) return null;

  const nights = nightsBetween(review.booking_check_in, review.booking_check_out);
  const channelRule = CHANNEL_REPLY_RULES[review.platform];

  // Outgoing-eligible CTA gating mirrors the prior ReviewCard logic.
  let guestReviewBlock: React.ReactNode = null;
  if (review.platform === "airbnb") {
    if (review.guest_review_airbnb_confirmed_at) {
      guestReviewBlock = (
        <span
          className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold"
          style={{ background: "rgba(26,122,90,0.1)", color: "var(--lagoon)", borderRadius: 10 }}
        >
          <CheckCircle2 size={12} /> Guest reviewed
        </span>
      );
    } else if (review.guest_review_submitted_at) {
      guestReviewBlock = (
        <span
          className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold"
          title="Submitted to Channex. Awaiting Airbnb confirmation."
          style={{ background: "rgba(212,150,11,0.1)", color: "var(--amber-tide)", borderRadius: 10 }}
        >
          Submitted, pending
        </span>
      );
    } else if (review.is_expired) {
      guestReviewBlock = (
        <span
          className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium"
          style={{ background: "var(--shore)", color: "var(--tideline)", borderRadius: 10 }}
        >
          Review time expired
        </span>
      );
    } else if (!review.channex_review_id) {
      guestReviewBlock = (
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
    } else {
      guestReviewBlock = (
        <button
          type="button"
          onClick={() => setGuestReviewOpen(true)}
          className="px-4 py-2 text-[12px] font-semibold transition-colors"
          style={{ background: "#fff", border: "1px solid var(--coastal)", color: "var(--coastal)", borderRadius: 10 }}
        >
          Review this guest
        </button>
      );
    }
  }

  const stayLabel =
    review.booking_check_in && review.booking_check_out
      ? `${review.booking_check_in} → ${review.booking_check_out}${nights != null ? ` · ${nights} night${nights === 1 ? "" : "s"}` : ""}`
      : null;

  const node = (
    <div className="fixed inset-0 z-50 flex">
      {/* scrim */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(19,46,32,0.4)" }}
        onClick={onClose}
      />

      {/* drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Review detail"
        className="relative ml-auto w-full sm:w-[520px] h-full bg-white overflow-y-auto"
        style={{ boxShadow: "-12px 0 32px rgba(19,46,32,0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div
          className="sticky top-0 z-10 bg-white px-5 py-4 flex items-center justify-between gap-3"
          style={{ borderBottom: "1px solid var(--dry-sand)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <PlatformLogo platform={review.platform} size="sm" />
            <span className="text-[14px] font-semibold truncate" style={{ color: "var(--coastal)" }}>
              {review.property_name.replace(/ - StayCommand$/i, "").replace(/ - Koast$/i, "").trim()}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="relative">
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
                  style={{ borderRadius: 10, border: "1px solid var(--dry-sand)", minWidth: 220, boxShadow: "var(--shadow-card)" }}
                >
                  <button
                    type="button"
                    onClick={toggleBad}
                    className="block w-full text-left px-3 py-2 text-[12px] hover:bg-shore"
                    style={{ color: "var(--coastal)" }}
                  >
                    {review.is_bad_review ? "Unmark as bad review" : "Mark as bad review"}
                  </button>
                  <button
                    type="button"
                    onClick={copyText}
                    disabled={!review.incoming_text}
                    className="block w-full text-left px-3 py-2 text-[12px] hover:bg-shore disabled:opacity-50 inline-flex items-center gap-2"
                    style={{ color: "var(--coastal)" }}
                  >
                    <Clipboard size={12} /> Copy review text
                  </button>
                </div>
              )}
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-2 rounded-lg hover:bg-shore"
              style={{ color: "var(--tideline)" }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="px-5 py-5 space-y-5">
          {/* Guest + stay */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              {editingName ? (
                <input
                  autoFocus
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => saveName(nameDraft)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); saveName(nameDraft); }
                    else if (e.key === "Escape") { e.preventDefault(); setEditingName(false); setNameDraft(review.guest_name_override ?? ""); }
                  }}
                  placeholder="Guest name…"
                  maxLength={200}
                  className="px-2 py-1 text-[15px] font-semibold"
                  style={{ border: "1px solid var(--dry-sand)", borderRadius: 8, color: "var(--coastal)", outline: "none" }}
                />
              ) : (
                <h2 className="text-[15px] font-semibold truncate" style={{ color: "var(--coastal)" }}>
                  {review.display_guest_name}
                </h2>
              )}
              {!editingName && (
                <button
                  type="button"
                  onClick={() => { setNameDraft(review.guest_name_override ?? ""); setEditingName(true); }}
                  aria-label="Edit guest name"
                  className="p-1 rounded hover:bg-shore"
                  style={{ color: "var(--tideline)" }}
                >
                  <Pencil size={11} />
                </button>
              )}
            </div>
            {stayLabel && (
              <p className="text-[12px]" style={{ color: "var(--tideline)" }}>
                {stayLabel}
              </p>
            )}
            {!stayLabel && (
              <p className="text-[12px] italic" style={{ color: "var(--shell)" }}>
                Booking link unavailable
              </p>
            )}
          </div>

          {/* Rating + flags */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1" style={{ color: "var(--golden)" }}>
              <span className="font-mono text-[14px]">
                {review.incoming_rating != null
                  ? "★".repeat(Math.max(0, Math.min(5, Math.round(review.incoming_rating))))
                  : ""}
                <span style={{ color: "var(--shell)" }}>
                  {review.incoming_rating != null
                    ? "☆".repeat(Math.max(0, 5 - Math.round(review.incoming_rating)))
                    : ""}
                </span>
              </span>
              <span className="text-[12px] font-semibold" style={{ color: "var(--coastal)" }}>
                {review.incoming_rating != null ? review.incoming_rating.toFixed(1) : "—"}
              </span>
            </div>
            {review.is_bad_review && (
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
                <Lock size={10} /> Private feedback
              </span>
            )}
          </div>

          {/* Public review */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--golden)" }}>
              Guest review
            </h3>
            {review.incoming_text ? (
              <p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={{ color: "var(--coastal)" }}>
                {review.incoming_text}
              </p>
            ) : (
              <p className="text-[13px] italic" style={{ color: "var(--shell)" }}>
                No written review.
              </p>
            )}
          </section>

          {/* Private feedback */}
          {review.private_feedback && (
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--amber-tide)" }}>
                Private feedback
              </h3>
              <p className="text-[13px] whitespace-pre-wrap leading-relaxed p-3" style={{
                color: "var(--coastal)",
                background: "rgba(212,150,11,0.05)",
                border: "1px solid rgba(212,150,11,0.18)",
                borderRadius: 10,
              }}>
                {review.private_feedback}
              </p>
            </section>
          )}

          {/* Subratings */}
          {Array.isArray(review.subratings) && review.subratings.length > 0 && (
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--golden)" }}>
                Subratings
              </h3>
              <div className="space-y-2">
                {SUBRATING_CATEGORIES.map((c) => {
                  const score = subratingMap.get(c.key);
                  if (score == null) return null;
                  return <SubratingBar key={c.key} label={c.label} score={score} />;
                })}
              </div>
            </section>
          )}

          {/* Reply composer */}
          {!review.response_sent && (
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--golden)" }}>
                Your reply
              </h3>
              {channelRule && (
                <p className="text-[11px] mb-2" style={{ color: "var(--tideline)" }}>
                  {channelRule}
                </p>
              )}
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder="Write a reply, or click Generate draft to start with an AI suggestion."
                rows={6}
                className="w-full px-3 py-2 text-[13px] bg-white"
                style={{ border: "1px solid var(--dry-sand)", borderRadius: 10, color: "var(--coastal)", outline: "none" }}
              />
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={generateDraft}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
                  style={{ border: "1px solid var(--dry-sand)", color: "var(--coastal)", borderRadius: 10, background: "#fff" }}
                >
                  <Sparkles size={12} />
                  {generating ? "Generating…" : "Generate draft"}
                </button>
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={saving || !composer.trim()}
                  className="px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
                  style={{ border: "1px solid var(--dry-sand)", color: "var(--coastal)", borderRadius: 10, background: "#fff" }}
                >
                  {saving ? "Saving…" : "Save draft"}
                </button>
                <button
                  type="button"
                  onClick={publish}
                  disabled={publishing || !composer.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
                  style={{ background: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
                >
                  <Check size={12} />
                  {publishing ? "Publishing…" : "Publish to Channex"}
                </button>
                {guestReviewBlock && <div className="ml-auto">{guestReviewBlock}</div>}
              </div>
              <p className="text-[11px] mt-2" style={{ color: "var(--tideline)" }}>
                {review.response_draft && !review.response_sent
                  ? `Draft saved · last edited ${formatDate(review.incoming_date)}`
                  : "No draft saved yet."}
              </p>
            </section>
          )}

          {review.response_sent && (
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--lagoon)" }}>
                Your reply
              </h3>
              <p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={{ color: "var(--coastal)" }}>
                {review.response_draft || review.incoming_text}
              </p>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--lagoon)" }}>
                  <CheckCircle2 size={11} /> Published
                </span>
                {guestReviewBlock && guestReviewBlock}
              </div>
            </section>
          )}
        </div>
      </aside>

      {guestReviewOpen && (
        <GuestReviewForm
          review={review}
          onClose={() => setGuestReviewOpen(false)}
          onSubmitted={onRefresh}
        />
      )}
    </div>
  );

  return createPortal(node, document.body);
}
