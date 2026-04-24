"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/components/ui/Toast";
import EmptyState from "@/components/ui/EmptyState";
import { Star } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

interface InlineDraft {
  bookingId: string;
  text: string;
  privateNote: string;
  rating: number;
  recommend: boolean;
  reviewId: string | null;
  scheduledAt: string | null;
}

export default function ReviewsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"outgoing" | "incoming" | "settings">("incoming");
  const [expandedIncoming, setExpandedIncoming] = useState<Set<string>>(new Set());
  const [data, setData] = useState<AnyData>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [inlineDrafts, setInlineDrafts] = useState<Map<string, InlineDraft>>(new Map());
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editDraftText, setEditDraftText] = useState("");
  const [editDraftRating, setEditDraftRating] = useState(5);
  const draftRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // Mount-only entrance trigger — review cards cascade once per load,
  // not on every state change (inline draft toggle, tab switch, etc.).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [ruleForm, setRuleForm] = useState({
    auto_publish: false,
    publish_delay_days: 3,
    tone: "warm",
    target_keywords: "clean, location, comfortable",
    bad_review_delay: true,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews/pending");
      const d = await res.json();
      setData(d);
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Scenario 1: Generate review and show inline
  // Session 6.1a: tracker param decouples the UI loading key from the
  // booking id. Synced Channex reviews have booking_id=null, which
  // collided with the initial `generating === null` state and left the
  // button stuck on "Writing your review...". Callers that already have
  // a stable row id (like a guest_reviews.id) should pass it as tracker.
  const generateReview = async (bookingId: string, tracker?: string) => {
    const key = tracker ?? bookingId;
    if (!bookingId) {
      toast("This review has no linked booking — generation unavailable", "error");
      return;
    }
    setGenerating(key);
    try {
      const res = await fetch(`/api/reviews/generate/${bookingId}`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);

      // Show draft inline immediately
      const newDrafts = new Map(inlineDrafts);
      newDrafts.set(bookingId, {
        bookingId,
        text: d.review_text,
        privateNote: d.private_note ?? "",
        rating: 5,
        recommend: true,
        reviewId: d.review_id ?? null,
        scheduledAt: d.scheduled_publish_at ?? null,
      });
      setInlineDrafts(newDrafts);

      toast("Review draft ready — see below");

      // Refresh data to get the review ID
      await fetchData();

      // Auto-scroll to the draft
      setTimeout(() => {
        const ref = draftRefs.current.get(bookingId);
        if (ref) ref.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
    setGenerating(null);
  };

  // Approve with optional edits
  const approveReview = async (reviewId: string, isBad = false, finalText?: string, starRating?: number) => {
    setApprovingId(reviewId);
    try {
      const res = await fetch(`/api/reviews/approve/${reviewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_bad_review: isBad,
          ...(finalText !== undefined && { final_text: finalText }),
          ...(starRating !== undefined && { star_rating: starRating }),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");

      if (isBad) {
        toast("Marked as bad review — held locally");
      } else {
        toast("Draft saved");
      }

      // Clear inline drafts
      setInlineDrafts(new Map());
      setEditingDraftId(null);

      await fetchData();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
    setApprovingId(null);
  };

  // Approve inline draft (from "Needs Review" section)
  const approveInlineDraft = async (bookingId: string) => {
    const draft = inlineDrafts.get(bookingId);
    if (!draft) return;

    // Find the review ID from the data
    const reviewId = draft.reviewId ?? data?.draft_reviews?.find((r: AnyData) => r.booking_id === bookingId)?.id;
    if (!reviewId) {
      toast("Review not found. Please refresh and try again.", "error");
      return;
    }

    await approveReview(reviewId, false, draft.text, draft.rating);
  };

  const dismissInlineDraft = (bookingId: string) => {
    const newDrafts = new Map(inlineDrafts);
    newDrafts.delete(bookingId);
    setInlineDrafts(newDrafts);
  };

  const respondToReview = async (reviewId: string, hasDraft: boolean) => {
    try {
      // Session 6.1a: interim verb. When a draft already exists the
      // button saves it (no Channex push). "Approve & Publish" — which
      // actually calls Channex's POST /reviews/:id/reply — returns in
      // 6.1b once the two-verb model is restored.
      const action = hasDraft ? "save_draft" : "generate";
      const res = await fetch(`/api/reviews/respond/${reviewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? `Failed (${res.status})`);
      toast(hasDraft ? "Draft saved" : "Draft generated — review before saving");
      fetchData();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  };

  const saveRules = async (propertyId: string) => {
    try {
      const res = await fetch(`/api/reviews/rules/${propertyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...ruleForm,
          target_keywords: ruleForm.target_keywords.split(",").map((k: string) => k.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast("Review rules saved!");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  };

  const StarRating = ({ rating, onChange, size = "text-lg" }: { rating: number; onChange?: (r: number) => void; size?: string }) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange?.(star)}
          disabled={!onChange}
          className={`${size} font-mono transition-colors ${star <= rating ? "" : "text-shell"} ${onChange ? "cursor-pointer" : "cursor-default"}`}
          style={star <= rating ? { color: "var(--golden)" } : undefined}
        >
          ★
        </button>
      ))}
    </div>
  );

  const statusBadge = (status: string) => {
    const colorStyles: Record<string, React.CSSProperties> = {
      pending: { backgroundColor: "var(--shore)", color: "var(--tideline)" },
      draft_generated: { backgroundColor: "rgba(196,154,90,0.1)", color: "var(--golden)" },
      approved: { backgroundColor: "rgba(26,122,90,0.1)", color: "var(--lagoon)" },
      scheduled: { backgroundColor: "rgba(196,154,90,0.1)", color: "var(--golden)" },
      published: { backgroundColor: "rgba(26,122,90,0.1)", color: "var(--lagoon)" },
      bad_review_held: { backgroundColor: "rgba(212,150,11,0.1)", color: "var(--amber-tide)" },
    };
    return (
      <span
        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
        style={colorStyles[status] ?? { backgroundColor: "var(--shore)", color: "var(--tideline)" }}
      >
        {status.replace(/_/g, " ")}
      </span>
    );
  };

  const pendingCount = (data?.needs_approval ?? 0) + (data?.needs_review ?? 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold mb-1" style={{ color: "var(--coastal)" }}>Reviews</h1>
          <p className="text-[13px]" style={{ color: "var(--tideline)" }}>AI-powered review automation</p>
        </div>
        {data && (
          <div className="flex gap-3">
            {data.needs_review > 0 && (
              <span className="px-3 py-1.5 text-xs font-medium rounded-full" style={{ backgroundColor: "rgba(212,150,11,0.1)", color: "var(--amber-tide)" }}>
                {data.needs_review} needs review
              </span>
            )}
            {data.needs_approval > 0 && (
              <span className="px-3 py-1.5 text-xs font-medium rounded-full" style={{ backgroundColor: "rgba(196,154,90,0.1)", color: "var(--golden)" }}>
                {data.needs_approval} drafts ready
              </span>
            )}
            {data.needs_response > 0 && (
              <span className="px-3 py-1.5 text-xs font-medium rounded-full" style={{ backgroundColor: "rgba(196,64,64,0.1)", color: "var(--coral-reef)" }}>
                {data.needs_response} needs response
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
        {([["outgoing", "Outgoing Reviews"], ["incoming", "Incoming Reviews"], ["settings", "Settings"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={
              tab === key
                ? { borderColor: "var(--golden)", color: "var(--coastal)" }
                : { borderColor: "transparent", color: "var(--tideline)" }
            }
          >
            {label}
            {key === "outgoing" && pendingCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-[10px] text-white rounded-full" style={{ backgroundColor: "var(--amber-tide)" }}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: "var(--dry-sand)", borderTopColor: "var(--golden)" }} />
        </div>
      ) : (
        <>
          {/* Outgoing Reviews */}
          {tab === "outgoing" && data && (
            <div className="space-y-6">

              {/* Pending approval banner */}
              {data.needs_approval > 0 && (
                <div className="p-4 flex items-center gap-3" style={{ backgroundColor: "rgba(196,154,90,0.1)", border: "1px solid rgba(196,154,90,0.25)", borderRadius: 14 }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(196,154,90,0.15)" }}>
                    <span className="text-sm font-bold" style={{ color: "var(--golden)" }}>{data.needs_approval}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--coastal)" }}>
                      {data.needs_approval} review{data.needs_approval !== 1 ? "s" : ""} pending your approval
                    </p>
                    <p className="text-xs" style={{ color: "var(--golden)" }}>Review the drafts below and approve or edit before publishing</p>
                  </div>
                </div>
              )}

              {/* Draft reviews (shown at TOP with warning highlight) */}
              {data.draft_reviews.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold tracking-[0.08em] uppercase mb-[14px]" style={{ color: "var(--golden)" }}>DRAFTS ({data.draft_reviews.length})</div>
                  <div className="space-y-3">
                    {data.draft_reviews.map((r: AnyData, cardIdx: number) => {
                      const isEditing = editingDraftId === r.id;
                      const hasText = r.draft_text && r.draft_text !== ".." && r.draft_text.length > 5;
                      const checkInFmt = r.check_in ? new Date(r.check_in + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                      const checkOutFmt = r.check_out ? new Date(r.check_out + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                      return (
                        <div
                          key={r.id}
                          className={`bg-white p-5 ${mounted ? "animate-cardReveal" : "opacity-0"}`}
                          style={{ boxShadow: "var(--shadow-card)", borderRadius: 16, animationDelay: `${cardIdx * 40}ms` }}
                        >
                          {/* Context row */}
                          <div className="flex items-center gap-3 mb-4">
                            {r.property_photo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.property_photo} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-dry-sand flex items-center justify-center flex-shrink-0">
                                <span className="text-coastal text-xs font-bold">{(r.property_name ?? "P").charAt(0)}</span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-coastal truncate">{r.property_name ?? "Property"}</p>
                              <p className="text-xs text-tideline">
                                {[
                                  r.guest_name ?? "Airbnb Guest",
                                  checkInFmt && (checkOutFmt ? `${checkInFmt} – ${checkOutFmt}` : checkInFmt),
                                ].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <StarRating
                              rating={isEditing ? editDraftRating : (r.star_rating ?? 5)}
                              onChange={isEditing ? (v) => setEditDraftRating(v) : undefined}
                            />
                          </div>

                          {isEditing ? (
                            <textarea
                              value={editDraftText}
                              onChange={(e) => setEditDraftText(e.target.value)}
                              rows={4}
                              className="w-full px-3 py-2 text-sm rounded-lg mb-4 bg-white focus:outline-none focus:ring-2 focus:ring-golden/30"
                              style={{ border: "1px solid var(--dry-sand)" }}
                            />
                          ) : hasText ? (
                            <p className="text-sm text-coastal mb-4 bg-shore rounded-[14px] p-3">
                              &quot;{r.draft_text}&quot;
                            </p>
                          ) : (
                            <div className="mb-4" style={{ background: "linear-gradient(135deg, var(--deep-sea), #0e2218)", color: "var(--shore)", borderRadius: 14, padding: 18 }}>
                              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full mb-2" style={{ backgroundColor: "rgba(196,154,90,0.2)", color: "var(--golden)" }}>Koast AI</span>
                              <p className="text-sm mb-3" style={{ color: "var(--shell)" }}>Generate a personalized review for this guest</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => generateReview(r.booking_id, r.id)}
                                  disabled={generating === r.id}
                                  className="text-sm disabled:opacity-50 transition-colors"
                                  style={{ backgroundColor: "var(--golden)", color: "var(--deep-sea)", borderRadius: 10, padding: "9px 16px", fontWeight: 600 }}
                                >
                                  {generating === r.id ? "Writing your review..." : "Generate AI Review"}
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2 flex-wrap">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => { approveReview(r.id, false, editDraftText, editDraftRating); setEditingDraftId(null); }}
                                  disabled={approvingId === r.id}
                                  className="px-4 py-2 text-xs font-medium hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
                                >
                                  {approvingId === r.id ? "Saving..." : "Save draft"}
                                </button>
                                <button
                                  onClick={() => setEditingDraftId(null)}
                                  className="px-4 py-2 text-xs font-medium text-tideline hover:text-coastal"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => approveReview(r.id)}
                                  disabled={approvingId === r.id}
                                  className="px-4 py-2 text-xs font-medium hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
                                >
                                  {approvingId === r.id ? "Saving..." : "Save draft"}
                                </button>
                                <button
                                  onClick={() => { setEditingDraftId(r.id); setEditDraftText(r.draft_text); setEditDraftRating(r.star_rating); }}
                                  className="px-4 py-2 bg-white text-coastal text-xs font-medium rounded-lg border border-[var(--border)] hover:bg-shore"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => approveReview(r.id, true)}
                                  className="px-4 py-2 text-xs font-medium border-0"
                                  style={{ backgroundColor: "rgba(196,64,64,0.1)", color: "var(--coral-reef)", borderRadius: 10 }}
                                >
                                  Mark as Bad Review
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pending bookings needing reviews */}
              {data.pending_bookings.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold tracking-[0.08em] uppercase mb-[14px]" style={{ color: "var(--golden)" }}>NEEDS REVIEW ({data.pending_bookings.length})</div>
                  <div className="space-y-2">
                    {data.pending_bookings.map((b: AnyData) => {
                      const draft = inlineDrafts.get(b.id);
                      return (
                        <div key={b.id}>
                          <div className="bg-white rounded-lg border border-[var(--border)] p-4 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-coastal">{b.guest_name ?? "Guest"}</p>
                              <p className="text-xs text-shell">
                                {b.check_in} → {b.check_out} · {b.platform}
                              </p>
                            </div>
                            <button
                              onClick={() => generateReview(b.id)}
                              disabled={generating === b.id}
                              className="px-4 py-2 text-xs font-semibold disabled:opacity-50 transition-colors"
                              style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
                            >
                              {generating === b.id ? (
                                <span className="flex items-center gap-2">
                                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                  Generating...
                                </span>
                              ) : "Generate AI Review"}
                            </button>
                          </div>

                          {/* Inline draft display */}
                          {draft && (
                            <div
                              ref={(el) => { draftRefs.current.set(b.id, el); }}
                              className="ml-4 mt-2 p-5 animate-in"
                              style={{ backgroundColor: "rgba(196,154,90,0.08)", borderRadius: 14, border: "1px solid rgba(196,154,90,0.2)" }}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--golden)" }}>AI-Generated Draft</p>
                                <StarRating
                                  rating={draft.rating}
                                  onChange={(r) => {
                                    const newDrafts = new Map(inlineDrafts);
                                    newDrafts.set(b.id, { ...draft, rating: r });
                                    setInlineDrafts(newDrafts);
                                  }}
                                />
                              </div>

                              <textarea
                                value={draft.text}
                                onChange={(e) => {
                                  const newDrafts = new Map(inlineDrafts);
                                  newDrafts.set(b.id, { ...draft, text: e.target.value });
                                  setInlineDrafts(newDrafts);
                                }}
                                rows={4}
                                className="w-full px-3 py-2 text-sm rounded-lg mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-golden/30"
                                style={{ border: "1px solid var(--dry-sand)" }}
                              />

                              <div className="flex items-center gap-4 mb-4">
                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={draft.recommend}
                                    onChange={(e) => {
                                      const newDrafts = new Map(inlineDrafts);
                                      newDrafts.set(b.id, { ...draft, recommend: e.target.checked });
                                      setInlineDrafts(newDrafts);
                                    }}
                                    className="w-4 h-4 rounded text-coastal"
                                  />
                                  <span className="text-coastal">Recommend guest</span>
                                </label>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={() => approveInlineDraft(b.id)}
                                  disabled={approvingId !== null}
                                  className="px-4 py-2 text-xs font-medium hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
                                >
                                  {approvingId ? "Saving..." : "Save draft"}
                                </button>
                                <button
                                  onClick={() => dismissInlineDraft(b.id)}
                                  className="px-4 py-2 text-xs font-medium text-tideline hover:text-coastal"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Scheduled */}
              {data.scheduled_reviews.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold tracking-[0.08em] uppercase mb-[14px]" style={{ color: "var(--golden)" }}>SCHEDULED ({data.scheduled_reviews.length})</div>
                  <div className="space-y-2">
                    {data.scheduled_reviews.map((r: AnyData, cardIdx: number) => (
                      <div
                        key={r.id}
                        className={`bg-white rounded-lg border border-[var(--border)] p-4 flex items-center justify-between ${mounted ? "animate-cardReveal" : "opacity-0"}`}
                        style={{ animationDelay: `${cardIdx * 40}ms` }}
                      >
                        <div className="min-w-0 flex-1 mr-4">
                          <p className="text-sm text-coastal truncate">{r.final_text ?? "\u2014"}</p>
                          <p className="text-xs text-success mt-1 font-medium">
                            Publishes: {r.scheduled_publish_at ? new Date(r.scheduled_publish_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "\u2014"}
                          </p>
                          <p className="text-[10px] text-shell">You can edit until the publish date</p>
                        </div>
                        {statusBadge("scheduled")}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.pending_bookings.length === 0 && data.draft_reviews.length === 0 && data.scheduled_reviews.length === 0 && (
                <EmptyState
                  icon={Star}
                  title="No reviews yet"
                  description="AI-powered reviews will be generated automatically after guest checkout."
                  action={{ label: "View Properties", href: "/properties" }}
                />
              )}
            </div>
          )}

          {/* Incoming Reviews */}
          {tab === "incoming" && data && (
            <div className="space-y-3">
              {data.incoming_reviews.length === 0 ? (
                <EmptyState
                  icon={Star}
                  title="No reviews yet"
                  description="AI-powered reviews will be generated automatically after guest checkout."
                  action={{ label: "View Properties", href: "/properties" }}
                />
              ) : (
                data.incoming_reviews.map((r: AnyData, cardIdx: number) => {
                  const isExpanded = expandedIncoming.has(r.id);
                  const fullText: string = r.incoming_text ?? "";
                  const preview = fullText.length > 180 && !isExpanded
                    ? fullText.slice(0, 180).trimEnd() + "…"
                    : fullText;
                  const displayName = r.guest_name ?? "Airbnb Guest";
                  return (
                  <div
                    key={r.id}
                    style={{ animationDelay: `${cardIdx * 40}ms` }}
                    className={`bg-white rounded-lg border p-5 ${mounted ? "animate-cardReveal" : "opacity-0"} ${
                    (r.incoming_rating ?? 5) < 4 ? "border-danger/30" : "border-[var(--border)]"
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-coastal truncate">{displayName}</span>
                        <span className="text-sm font-bold font-mono" style={{ color: (r.incoming_rating ?? 5) < 4 ? "var(--coral-reef)" : "var(--golden)" }}>
                          {"★".repeat(Math.round(r.incoming_rating ?? 5))}
                        </span>
                        <span className="text-xs text-shell font-mono">
                          {r.incoming_rating}/5
                        </span>
                      </div>
                      {r.response_sent ? (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(26,122,90,0.1)", color: "var(--lagoon)" }}>responded</span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(196,64,64,0.1)", color: "var(--coral-reef)" }}>needs response</span>
                      )}
                    </div>
                    {fullText ? (
                      <p className="text-sm text-coastal mb-3 whitespace-pre-wrap">
                        {preview}
                        {fullText.length > 180 && (
                          <button
                            onClick={() => {
                              const next = new Set(expandedIncoming);
                              if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                              setExpandedIncoming(next);
                            }}
                            className="ml-1 text-xs font-medium"
                            style={{ color: "var(--golden)" }}
                          >
                            {isExpanded ? "Show less" : "Read more"}
                          </button>
                        )}
                      </p>
                    ) : (
                      <p className="text-sm mb-3" style={{ color: "var(--shell)" }}>No review text</p>
                    )}
                    {r.response_draft && (
                      <div className="rounded-lg p-3 mb-3" style={{ backgroundColor: "rgba(196,154,90,0.08)" }}>
                        <p className="text-[10px] font-medium mb-1" style={{ color: "var(--golden)" }}>AI RESPONSE DRAFT</p>
                        <p className="text-sm text-coastal">{r.response_draft}</p>
                      </div>
                    )}
                    {!r.response_sent && (
                      <button
                        onClick={() => respondToReview(r.id, !!r.response_draft)}
                        className="px-4 py-2 text-xs font-semibold transition-colors hover:opacity-90"
                        style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
                      >
                        {r.response_draft ? "Save draft" : "Generate AI draft"}
                      </button>
                    )}
                  </div>
                  );
                })
              )}
            </div>
          )}

          {/* Settings */}
          {tab === "settings" && (
            <div className="bg-white rounded-lg border border-[var(--border)] p-6 max-w-xl">
              <div className="text-[11px] font-bold tracking-[0.08em] uppercase mb-[14px]" style={{ color: "var(--golden)" }}>REVIEW RULES</div>
              <div className="space-y-4">
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={ruleForm.auto_publish}
                    onChange={(e) => setRuleForm({ ...ruleForm, auto_publish: e.target.checked })}
                    className="w-4 h-4 rounded text-coastal" />
                  <div>
                    <p className="text-sm font-medium text-coastal">Auto-publish reviews</p>
                    <p className="text-xs text-shell">Post AI reviews without manual approval</p>
                  </div>
                </label>

                <div>
                  <label className="block text-sm font-medium text-coastal mb-1">
                    Publish Delay (days after checkout)
                  </label>
                  <input type="number" value={ruleForm.publish_delay_days} min={1} max={13}
                    onChange={(e) => setRuleForm({ ...ruleForm, publish_delay_days: parseInt(e.target.value) || 3 })}
                    className="w-24 px-3 py-2 border border-[var(--border)] rounded-lg text-sm" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-coastal mb-1">Tone</label>
                  <select value={ruleForm.tone}
                    onChange={(e) => setRuleForm({ ...ruleForm, tone: e.target.value })}
                    className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-white">
                    <option value="warm">Warm</option>
                    <option value="professional">Professional</option>
                    <option value="enthusiastic">Enthusiastic</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-coastal mb-1">
                    Target Keywords (comma-separated)
                  </label>
                  <input type="text" value={ruleForm.target_keywords}
                    onChange={(e) => setRuleForm({ ...ruleForm, target_keywords: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm"
                    placeholder="clean, location, quiet, spacious" />
                  <p className="text-xs text-shell mt-1">
                    These keywords will be naturally woven into AI-generated reviews for Airbnb SEO.
                  </p>
                </div>

                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={ruleForm.bad_review_delay}
                    onChange={(e) => setRuleForm({ ...ruleForm, bad_review_delay: e.target.checked })}
                    className="w-4 h-4 rounded text-coastal" />
                  <div>
                    <p className="text-sm font-medium text-coastal">Delay bad reviews</p>
                    <p className="text-xs text-shell">Hold negative reviews until the last 2 hours of the 14-day window</p>
                  </div>
                </label>

                <button
                  onClick={() => saveRules(data?.pending_bookings?.[0]?.property_id ?? "")}
                  className="px-5 py-2.5 text-sm font-semibold transition-colors hover:opacity-90"
                  style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
                >
                  Save Rules
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
