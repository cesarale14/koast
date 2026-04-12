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
  const [tab, setTab] = useState<"outgoing" | "incoming" | "settings">("outgoing");
  const [data, setData] = useState<AnyData>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [inlineDrafts, setInlineDrafts] = useState<Map<string, InlineDraft>>(new Map());
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editDraftText, setEditDraftText] = useState("");
  const [editDraftRating, setEditDraftRating] = useState(5);
  const draftRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
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
  const generateReview = async (bookingId: string) => {
    setGenerating(bookingId);
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

      const publishDate = d.scheduled_publish_at
        ? new Date(d.scheduled_publish_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : "soon";

      if (isBad) {
        toast("Held for delayed publishing");
      } else {
        toast(`Review scheduled for ${publishDate}. You can edit it until then.`);
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
      const action = hasDraft ? "approve" : "generate";
      const res = await fetch(`/api/reviews/respond/${reviewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Failed");
      toast(hasDraft ? "Response approved & sent!" : "Draft generated — review before approving");
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
          className={`${size} font-mono transition-colors ${star <= rating ? "text-warning" : "text-neutral-300"} ${onChange ? "cursor-pointer hover:text-warning" : "cursor-default"}`}
        >
          ★
        </button>
      ))}
    </div>
  );

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-neutral-100 text-neutral-600",
      draft_generated: "bg-brand-50 text-brand-600",
      approved: "bg-success-light text-success",
      scheduled: "bg-brand-50 text-brand-600",
      published: "bg-success-light text-success",
      bad_review_held: "bg-warning-light text-warning",
    };
    return (
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colors[status] ?? "bg-neutral-100 text-neutral-500"}`}>
        {status.replace(/_/g, " ")}
      </span>
    );
  };

  const pendingCount = (data?.needs_approval ?? 0) + (data?.needs_review ?? 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-neutral-800 mb-1">Reviews</h1>
          <p className="text-sm text-neutral-500">AI-powered review automation</p>
        </div>
        {data && (
          <div className="flex gap-3">
            {data.needs_review > 0 && (
              <span className="px-3 py-1.5 bg-warning-light text-warning text-xs font-medium rounded-full">
                {data.needs_review} needs review
              </span>
            )}
            {data.needs_approval > 0 && (
              <span className="px-3 py-1.5 bg-brand-50 text-brand-600 text-xs font-medium rounded-full">
                {data.needs_approval} drafts ready
              </span>
            )}
            {data.needs_response > 0 && (
              <span className="px-3 py-1.5 bg-danger-light text-danger text-xs font-medium rounded-full">
                {data.needs_response} needs response
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-6">
        {([["outgoing", "Outgoing Reviews"], ["incoming", "Incoming Reviews"], ["settings", "Settings"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? "border-brand-500 text-brand-600" : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {label}
            {key === "outgoing" && pendingCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-warning text-white rounded-full">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Outgoing Reviews */}
          {tab === "outgoing" && data && (
            <div className="space-y-6">

              {/* Pending approval banner */}
              {data.needs_approval > 0 && (
                <div className="bg-warning-light border border-warning/20 rounded-lg p-4 flex items-center gap-3">
                  <div className="w-8 h-8 bg-warning/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-warning text-sm font-bold">{data.needs_approval}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      {data.needs_approval} review{data.needs_approval !== 1 ? "s" : ""} pending your approval
                    </p>
                    <p className="text-xs text-warning">Review the drafts below and approve or edit before publishing</p>
                  </div>
                </div>
              )}

              {/* Draft reviews (shown at TOP with warning highlight) */}
              {data.draft_reviews.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-neutral-800 mb-3">Drafts ({data.draft_reviews.length})</h2>
                  <div className="space-y-3">
                    {data.draft_reviews.map((r: AnyData) => {
                      const isEditing = editingDraftId === r.id;
                      const hasText = r.draft_text && r.draft_text !== ".." && r.draft_text.length > 5;
                      const checkInFmt = r.check_in ? new Date(r.check_in + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                      const checkOutFmt = r.check_out ? new Date(r.check_out + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                      return (
                        <div key={r.id} className="bg-neutral-0 rounded-xl shadow-sm p-5">
                          {/* Context row */}
                          <div className="flex items-center gap-3 mb-4">
                            {r.property_photo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.property_photo} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-[#eef5f0] flex items-center justify-center flex-shrink-0">
                                <span className="text-[#1a3a2a] text-xs font-bold">{(r.property_name ?? "P").charAt(0)}</span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-neutral-800 truncate">{r.property_name ?? "Property"}</p>
                              <p className="text-xs text-neutral-500">{r.guest_name ?? "Airbnb Guest"} &middot; {checkInFmt}{checkOutFmt ? ` – ${checkOutFmt}` : ""}</p>
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
                              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg mb-4 bg-neutral-0 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                            />
                          ) : hasText ? (
                            <p className="text-sm text-neutral-700 mb-4 bg-neutral-50 rounded-lg p-3">
                              &quot;{r.draft_text}&quot;
                            </p>
                          ) : (
                            <div className="mb-4">
                              <button
                                onClick={() => generateReview(r.booking_id)}
                                disabled={generating === r.booking_id}
                                className="w-full py-3 text-sm font-semibold text-[#1a3a2a] bg-[#eef5f0] rounded-lg hover:bg-[#eef5f0] transition-colors disabled:opacity-50"
                              >
                                {generating === r.booking_id ? "Writing your review..." : "✨ Generate AI Review"}
                              </button>
                            </div>
                          )}

                          <div className="flex gap-2 flex-wrap">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => { approveReview(r.id, false, editDraftText, editDraftRating); setEditingDraftId(null); }}
                                  disabled={approvingId === r.id}
                                  className="px-4 py-2 bg-success text-white text-xs font-medium rounded-lg hover:bg-success/90 disabled:opacity-50"
                                >
                                  {approvingId === r.id ? "Scheduling..." : "Approve & Schedule"}
                                </button>
                                <button
                                  onClick={() => setEditingDraftId(null)}
                                  className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-neutral-900"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => approveReview(r.id)}
                                  disabled={approvingId === r.id}
                                  className="px-4 py-2 bg-success text-white text-xs font-medium rounded-lg hover:bg-success/90 disabled:opacity-50"
                                >
                                  {approvingId === r.id ? "Scheduling..." : "Approve & Schedule"}
                                </button>
                                <button
                                  onClick={() => { setEditingDraftId(r.id); setEditDraftText(r.draft_text); setEditDraftRating(r.star_rating); }}
                                  className="px-4 py-2 bg-neutral-0 text-neutral-700 text-xs font-medium rounded-lg border border-[var(--border)] hover:bg-neutral-50"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => approveReview(r.id, true)}
                                  className="px-4 py-2 bg-neutral-0 text-danger text-xs font-medium rounded-lg border border-danger/20 hover:bg-danger-light"
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
                  <h2 className="text-lg font-semibold text-neutral-800 mb-3">Needs Review ({data.pending_bookings.length})</h2>
                  <div className="space-y-2">
                    {data.pending_bookings.map((b: AnyData) => {
                      const draft = inlineDrafts.get(b.id);
                      return (
                        <div key={b.id}>
                          <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-4 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-neutral-900">{b.guest_name ?? "Guest"}</p>
                              <p className="text-xs text-neutral-400">
                                {b.check_in} → {b.check_out} · {b.platform}
                              </p>
                            </div>
                            <button
                              onClick={() => generateReview(b.id)}
                              disabled={generating === b.id}
                              className="px-4 py-2 bg-brand-500 text-white text-xs font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50"
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
                              className="ml-4 mt-2 bg-brand-50 rounded-lg border border-brand-200 p-5 animate-in"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-medium text-brand-500 uppercase tracking-wider">AI-Generated Draft</p>
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
                                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg mb-3 bg-neutral-0 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
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
                                    className="w-4 h-4 rounded text-brand-500"
                                  />
                                  <span className="text-neutral-700">Recommend guest</span>
                                </label>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={() => approveInlineDraft(b.id)}
                                  disabled={approvingId !== null}
                                  className="px-4 py-2 bg-success text-white text-xs font-medium rounded-lg hover:bg-success/90 disabled:opacity-50"
                                >
                                  {approvingId ? "Scheduling..." : "Approve & Schedule"}
                                </button>
                                <button
                                  onClick={() => dismissInlineDraft(b.id)}
                                  className="px-4 py-2 text-xs font-medium text-neutral-500 hover:text-neutral-700"
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
                  <h2 className="text-lg font-semibold text-neutral-800 mb-3">Scheduled ({data.scheduled_reviews.length})</h2>
                  <div className="space-y-2">
                    {data.scheduled_reviews.map((r: AnyData) => (
                      <div key={r.id} className="bg-neutral-0 rounded-lg border border-[var(--border)] p-4 flex items-center justify-between">
                        <div className="min-w-0 flex-1 mr-4">
                          <p className="text-sm text-neutral-700 truncate">{r.final_text ?? "\u2014"}</p>
                          <p className="text-xs text-success mt-1 font-medium">
                            Publishes: {r.scheduled_publish_at ? new Date(r.scheduled_publish_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "\u2014"}
                          </p>
                          <p className="text-[10px] text-neutral-400">You can edit until the publish date</p>
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
                data.incoming_reviews.map((r: AnyData) => (
                  <div key={r.id} className={`bg-neutral-0 rounded-lg border p-5 ${
                    (r.incoming_rating ?? 5) < 4 ? "border-danger/30" : "border-[var(--border)]"
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold font-mono ${(r.incoming_rating ?? 5) < 4 ? "text-danger" : "text-warning"}`}>
                          {"★".repeat(Math.round(r.incoming_rating ?? 5))}
                        </span>
                        <span className="text-xs text-neutral-400 font-mono">
                          {r.incoming_rating}/5
                        </span>
                      </div>
                      {r.response_sent ? (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-success-light text-success">responded</span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-danger-light text-danger">needs response</span>
                      )}
                    </div>
                    <p className="text-sm text-neutral-700 mb-3">{r.incoming_text}</p>
                    {r.response_draft && (
                      <div className="bg-brand-50 rounded-lg p-3 mb-3">
                        <p className="text-[10px] text-brand-500 font-medium mb-1">AI RESPONSE DRAFT</p>
                        <p className="text-sm text-neutral-800">{r.response_draft}</p>
                      </div>
                    )}
                    {!r.response_sent && (
                      <button
                        onClick={() => respondToReview(r.id, !!r.response_draft)}
                        className="px-4 py-2 bg-brand-500 text-white text-xs font-semibold rounded-lg hover:bg-brand-600"
                      >
                        {r.response_draft ? "Approve Response" : "Generate Draft Response"}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Settings */}
          {tab === "settings" && (
            <div className="bg-neutral-0 rounded-lg border border-[var(--border)] p-6 max-w-xl">
              <h2 className="text-lg font-semibold text-neutral-800 mb-4">Review Rules</h2>
              <div className="space-y-4">
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={ruleForm.auto_publish}
                    onChange={(e) => setRuleForm({ ...ruleForm, auto_publish: e.target.checked })}
                    className="w-4 h-4 rounded text-brand-500" />
                  <div>
                    <p className="text-sm font-medium text-neutral-900">Auto-publish reviews</p>
                    <p className="text-xs text-neutral-400">Post AI reviews without manual approval</p>
                  </div>
                </label>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Publish Delay (days after checkout)
                  </label>
                  <input type="number" value={ruleForm.publish_delay_days} min={1} max={13}
                    onChange={(e) => setRuleForm({ ...ruleForm, publish_delay_days: parseInt(e.target.value) || 3 })}
                    className="w-24 px-3 py-2 border border-[var(--border)] rounded-lg text-sm" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Tone</label>
                  <select value={ruleForm.tone}
                    onChange={(e) => setRuleForm({ ...ruleForm, tone: e.target.value })}
                    className="px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-neutral-0">
                    <option value="warm">Warm</option>
                    <option value="professional">Professional</option>
                    <option value="enthusiastic">Enthusiastic</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Target Keywords (comma-separated)
                  </label>
                  <input type="text" value={ruleForm.target_keywords}
                    onChange={(e) => setRuleForm({ ...ruleForm, target_keywords: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm"
                    placeholder="clean, location, quiet, spacious" />
                  <p className="text-xs text-neutral-400 mt-1">
                    These keywords will be naturally woven into AI-generated reviews for Airbnb SEO.
                  </p>
                </div>

                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={ruleForm.bad_review_delay}
                    onChange={(e) => setRuleForm({ ...ruleForm, bad_review_delay: e.target.checked })}
                    className="w-4 h-4 rounded text-brand-500" />
                  <div>
                    <p className="text-sm font-medium text-neutral-900">Delay bad reviews</p>
                    <p className="text-xs text-neutral-400">Hold negative reviews until the last 2 hours of the 14-day window</p>
                  </div>
                </label>

                <button
                  onClick={() => saveRules(data?.pending_bookings?.[0]?.property_id ?? "")}
                  className="px-5 py-2.5 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600"
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
