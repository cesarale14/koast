"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/components/ui/Toast";

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

  const respondToReview = async (reviewId: string) => {
    try {
      const res = await fetch(`/api/reviews/respond/${reviewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed");
      toast("Response generated & saved!");
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
          className={`${size} transition-colors ${star <= rating ? "text-amber-400" : "text-gray-300"} ${onChange ? "cursor-pointer hover:text-amber-500" : "cursor-default"}`}
        >
          ★
        </button>
      ))}
    </div>
  );

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-gray-100 text-gray-600",
      draft_generated: "bg-blue-50 text-blue-700",
      approved: "bg-emerald-50 text-emerald-700",
      scheduled: "bg-amber-50 text-amber-700",
      published: "bg-green-50 text-green-700",
      bad_review_held: "bg-red-50 text-red-700",
    };
    return (
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colors[status] ?? "bg-gray-100 text-gray-500"}`}>
        {status.replace(/_/g, " ")}
      </span>
    );
  };

  const pendingCount = (data?.needs_approval ?? 0) + (data?.needs_review ?? 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Reviews</h1>
          <p className="text-gray-500">AI-powered review automation</p>
        </div>
        {data && (
          <div className="flex gap-3">
            {data.needs_review > 0 && (
              <span className="px-3 py-1.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-full">
                {data.needs_review} needs review
              </span>
            )}
            {data.needs_approval > 0 && (
              <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                {data.needs_approval} drafts ready
              </span>
            )}
            {data.needs_response > 0 && (
              <span className="px-3 py-1.5 bg-red-50 text-red-700 text-xs font-medium rounded-full">
                {data.needs_response} needs response
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([["outgoing", "Outgoing Reviews"], ["incoming", "Incoming Reviews"], ["settings", "Settings"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {key === "outgoing" && pendingCount > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-amber-500 text-white rounded-full">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Outgoing Reviews */}
          {tab === "outgoing" && data && (
            <div className="space-y-6">

              {/* Pending approval banner */}
              {data.needs_approval > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-amber-600 text-sm font-bold">{data.needs_approval}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-amber-900">
                      {data.needs_approval} review{data.needs_approval !== 1 ? "s" : ""} pending your approval
                    </p>
                    <p className="text-xs text-amber-600">Review the drafts below and approve or edit before publishing</p>
                  </div>
                </div>
              )}

              {/* Draft reviews (shown at TOP with yellow highlight) */}
              {data.draft_reviews.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">Drafts ({data.draft_reviews.length})</h2>
                  <div className="space-y-3">
                    {data.draft_reviews.map((r: AnyData) => {
                      const isEditing = editingDraftId === r.id;
                      return (
                        <div key={r.id} className="bg-amber-50 rounded-xl border border-amber-200 p-5">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              {statusBadge(r.status)}
                              <StarRating
                                rating={isEditing ? editDraftRating : r.star_rating}
                                onChange={isEditing ? (v) => setEditDraftRating(v) : undefined}
                              />
                            </div>
                            <span className="text-xs text-gray-400">Booking: {r.booking_id?.slice(0, 8)}</span>
                          </div>

                          {isEditing ? (
                            <textarea
                              value={editDraftText}
                              onChange={(e) => setEditDraftText(e.target.value)}
                              rows={4}
                              className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg mb-4 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                            />
                          ) : (
                            <p className="text-sm text-gray-700 mb-4 italic bg-white rounded-lg p-3 border border-amber-100">
                              &quot;{r.draft_text}&quot;
                            </p>
                          )}

                          <div className="flex gap-2 flex-wrap">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => { approveReview(r.id, false, editDraftText, editDraftRating); setEditingDraftId(null); }}
                                  disabled={approvingId === r.id}
                                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {approvingId === r.id ? "Scheduling..." : "Approve & Schedule"}
                                </button>
                                <button
                                  onClick={() => setEditingDraftId(null)}
                                  className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-900"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => approveReview(r.id)}
                                  disabled={approvingId === r.id}
                                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {approvingId === r.id ? "Scheduling..." : "Approve & Schedule"}
                                </button>
                                <button
                                  onClick={() => { setEditingDraftId(r.id); setEditDraftText(r.draft_text); setEditDraftRating(r.star_rating); }}
                                  className="px-4 py-2 bg-white text-gray-700 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => approveReview(r.id, true)}
                                  className="px-4 py-2 bg-white text-red-600 text-xs font-medium rounded-lg border border-red-200 hover:bg-red-50"
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
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">Needs Review ({data.pending_bookings.length})</h2>
                  <div className="space-y-2">
                    {data.pending_bookings.map((b: AnyData) => {
                      const draft = inlineDrafts.get(b.id);
                      return (
                        <div key={b.id}>
                          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{b.guest_name ?? "Guest"}</p>
                              <p className="text-xs text-gray-400">
                                {b.check_in} → {b.check_out} · {b.platform}
                              </p>
                            </div>
                            <button
                              onClick={() => generateReview(b.id)}
                              disabled={generating === b.id}
                              className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
                              className="ml-4 mt-2 bg-blue-50 rounded-xl border border-blue-200 p-5 animate-in"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">AI-Generated Draft</p>
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
                                className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg mb-3 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
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
                                    className="w-4 h-4 rounded text-blue-600"
                                  />
                                  <span className="text-gray-700">Recommend guest</span>
                                </label>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={() => approveInlineDraft(b.id)}
                                  disabled={approvingId !== null}
                                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {approvingId ? "Scheduling..." : "Approve & Schedule"}
                                </button>
                                <button
                                  onClick={() => dismissInlineDraft(b.id)}
                                  className="px-4 py-2 text-xs font-medium text-gray-500 hover:text-gray-700"
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
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">Scheduled ({data.scheduled_reviews.length})</h2>
                  <div className="space-y-2">
                    {data.scheduled_reviews.map((r: AnyData) => (
                      <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                        <div className="min-w-0 flex-1 mr-4">
                          <p className="text-sm text-gray-700 truncate">{r.final_text ?? "\u2014"}</p>
                          <p className="text-xs text-emerald-600 mt-1 font-medium">
                            Publishes: {r.scheduled_publish_at ? new Date(r.scheduled_publish_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "\u2014"}
                          </p>
                          <p className="text-[10px] text-gray-400">You can edit until the publish date</p>
                        </div>
                        {statusBadge("scheduled")}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.pending_bookings.length === 0 && data.draft_reviews.length === 0 && data.scheduled_reviews.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
                  No outgoing reviews to manage. Reviews will appear after guests check out.
                </div>
              )}
            </div>
          )}

          {/* Incoming Reviews */}
          {tab === "incoming" && data && (
            <div className="space-y-3">
              {data.incoming_reviews.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
                  No incoming reviews yet.
                </div>
              ) : (
                data.incoming_reviews.map((r: AnyData) => (
                  <div key={r.id} className={`bg-white rounded-xl border p-5 ${
                    (r.incoming_rating ?? 5) < 4 ? "border-red-200" : "border-gray-200"
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${(r.incoming_rating ?? 5) < 4 ? "text-red-600" : "text-amber-500"}`}>
                          {"★".repeat(Math.round(r.incoming_rating ?? 5))}
                        </span>
                        <span className="text-xs text-gray-400">
                          {r.incoming_rating}/5
                        </span>
                      </div>
                      {r.response_sent ? (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">responded</span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700">needs response</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 mb-3">{r.incoming_text}</p>
                    {r.response_draft && (
                      <div className="bg-blue-50 rounded-lg p-3 mb-3">
                        <p className="text-[10px] text-blue-500 font-medium mb-1">AI RESPONSE DRAFT</p>
                        <p className="text-sm text-blue-900">{r.response_draft}</p>
                      </div>
                    )}
                    {!r.response_sent && (
                      <button
                        onClick={() => respondToReview(r.id)}
                        className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
                      >
                        {r.response_draft ? "Approve Response" : "Generate & Send Response"}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Settings */}
          {tab === "settings" && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-xl">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Review Rules</h2>
              <div className="space-y-4">
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={ruleForm.auto_publish}
                    onChange={(e) => setRuleForm({ ...ruleForm, auto_publish: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Auto-publish reviews</p>
                    <p className="text-xs text-gray-400">Post AI reviews without manual approval</p>
                  </div>
                </label>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Publish Delay (days after checkout)
                  </label>
                  <input type="number" value={ruleForm.publish_delay_days} min={1} max={13}
                    onChange={(e) => setRuleForm({ ...ruleForm, publish_delay_days: parseInt(e.target.value) || 3 })}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tone</label>
                  <select value={ruleForm.tone}
                    onChange={(e) => setRuleForm({ ...ruleForm, tone: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                    <option value="warm">Warm</option>
                    <option value="professional">Professional</option>
                    <option value="enthusiastic">Enthusiastic</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Keywords (comma-separated)
                  </label>
                  <input type="text" value={ruleForm.target_keywords}
                    onChange={(e) => setRuleForm({ ...ruleForm, target_keywords: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="clean, location, quiet, spacious" />
                  <p className="text-xs text-gray-400 mt-1">
                    These keywords will be naturally woven into AI-generated reviews for Airbnb SEO.
                  </p>
                </div>

                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={ruleForm.bad_review_delay}
                    onChange={(e) => setRuleForm({ ...ruleForm, bad_review_delay: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Delay bad reviews</p>
                    <p className="text-xs text-gray-400">Hold negative reviews until the last 2 hours of the 14-day window</p>
                  </div>
                </label>

                <button
                  onClick={() => saveRules(data?.pending_bookings?.[0]?.property_id ?? "")}
                  className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
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
