"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

export default function ReviewsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"outgoing" | "incoming" | "settings">("outgoing");
  const [data, setData] = useState<AnyData>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
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

  const generateReview = async (bookingId: string) => {
    setGenerating(bookingId);
    try {
      const res = await fetch(`/api/reviews/generate/${bookingId}`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast("Review draft generated!");
      fetchData();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
    setGenerating(null);
  };

  const approveReview = async (reviewId: string, isBad = false) => {
    try {
      const res = await fetch(`/api/reviews/approve/${reviewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_bad_review: isBad }),
      });
      if (!res.ok) throw new Error("Failed");
      toast(isBad ? "Held for delayed publishing" : "Approved & scheduled!");
      fetchData();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
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
        {status.replace("_", " ")}
      </span>
    );
  };

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
              {/* Pending bookings needing reviews */}
              {data.pending_bookings.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">Needs Review ({data.pending_bookings.length})</h2>
                  <div className="space-y-2">
                    {data.pending_bookings.map((b: AnyData) => (
                      <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
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
                          {generating === b.id ? "Generating..." : "Generate AI Review"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Draft reviews */}
              {data.draft_reviews.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">Drafts ({data.draft_reviews.length})</h2>
                  <div className="space-y-3">
                    {data.draft_reviews.map((r: AnyData) => (
                      <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {statusBadge(r.status)}
                            <span className="text-xs text-gray-400">
                              {"★".repeat(r.star_rating)}{"☆".repeat(5 - r.star_rating)}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 mb-4 italic">&quot;{r.draft_text}&quot;</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveReview(r.id)}
                            className="px-4 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700"
                          >
                            Approve & Schedule
                          </button>
                          <button
                            onClick={() => approveReview(r.id, true)}
                            className="px-4 py-2 bg-white text-red-600 text-xs font-medium rounded-lg border border-red-200 hover:bg-red-50"
                          >
                            Mark as Bad Review
                          </button>
                        </div>
                      </div>
                    ))}
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
                        <div>
                          <p className="text-sm text-gray-700 truncate max-w-md">{r.final_text ?? "—"}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            Publishes: {r.scheduled_publish_at ? new Date(r.scheduled_publish_at).toLocaleDateString() : "—"}
                          </p>
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
