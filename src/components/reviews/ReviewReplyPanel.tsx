"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { AlertTriangle, Lock, Sparkles, X } from "lucide-react";
import type { ReviewCardModel } from "./ReviewCard";

interface ReviewReplyPanelProps {
  review: ReviewCardModel;
  onClose: () => void;
  onUpdated: () => void;
}

export default function ReviewReplyPanel({ review, onClose, onUpdated }: ReviewReplyPanelProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<string>(review.response_draft ?? "");
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  const subratings = Array.isArray(review.subratings) ? review.subratings : [];

  const generateDraft = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/reviews/respond/${review.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? `Failed (${res.status})`);
      if (payload.response_text) setDraft(payload.response_text);
      onUpdated();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setGenerating(false);
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/reviews/respond/${review.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_draft", response_text: draft }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? `Failed (${res.status})`);
      toast("Draft saved");
      onUpdated();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!draft.trim()) {
      toast("Draft is empty", "error");
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch(`/api/reviews/respond/${review.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", response_text: draft }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? `Failed (${res.status})`);
      const platformLabel = review.platform === "booking_com" ? "Booking.com" : "Airbnb";
      const who = review.guest_name ?? "guest";
      toast(`Reply posted to ${who} on ${platformLabel}`);
      onUpdated();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div
      className="mt-4 p-4"
      style={{
        background: "var(--shore)",
        borderRadius: 12,
        border: "1px solid var(--dry-sand)",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: "var(--golden)" }}>
          Reply
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-white"
          aria-label="Close reply panel"
          style={{ color: "var(--tideline)" }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Context (expandable) */}
      <button
        type="button"
        onClick={() => setContextOpen((v) => !v)}
        className="text-[12px] font-medium mb-3"
        style={{ color: "var(--tideline)" }}
      >
        {contextOpen ? "Hide context ▴" : "Show full context ▾"}
      </button>

      {contextOpen && (
        <div className="mb-4 space-y-3">
          {review.incoming_text && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1" style={{ color: "var(--tideline)" }}>
                Guest review
              </div>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--coastal)" }}>
                {review.incoming_text}
              </p>
            </div>
          )}
          {review.private_feedback && (
            <div
              className="p-3"
              style={{
                background: "rgba(212,150,11,0.08)",
                border: "1px solid rgba(212,150,11,0.2)",
                borderRadius: 10,
              }}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1 inline-flex items-center gap-1.5" style={{ color: "var(--amber-tide)" }}>
                <Lock size={10} /> Private — not publicly posted
              </div>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--coastal)" }}>
                {review.private_feedback}
              </p>
            </div>
          )}
          {(review.booking_check_in || review.booking_check_out) && (
            <div className="text-[12px]" style={{ color: "var(--tideline)" }}>
              Stay: {review.booking_check_in ?? "?"} → {review.booking_check_out ?? "?"}
              {review.booking_nights != null && ` · ${review.booking_nights} night${review.booking_nights === 1 ? "" : "s"}`}
            </div>
          )}
          {subratings.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1.5" style={{ color: "var(--tideline)" }}>
                Subratings
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {subratings.map((s: { category: string; score: number }, i: number) => (
                  <div key={i} className="text-[12px] flex items-center justify-between">
                    <span style={{ color: "var(--tideline)" }}>{s.category.replace(/_/g, " ")}</span>
                    <span className="font-mono font-semibold" style={{ color: "var(--coastal)" }}>
                      {Number(s.score).toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Draft textarea */}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={5}
        placeholder="Write a reply or generate one with AI…"
        className="w-full px-3 py-2 text-[13px] rounded-lg mb-2 bg-white focus:outline-none focus:ring-2 focus:ring-golden/30"
        style={{ border: "1px solid var(--dry-sand)", color: "var(--coastal)" }}
      />
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px]" style={{ color: "var(--tideline)" }}>
          {draft.length} characters
        </span>
        <button
          type="button"
          onClick={generateDraft}
          disabled={generating}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium disabled:opacity-50"
          style={{ color: "var(--golden)" }}
        >
          {generating ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--golden)", borderTopColor: "transparent" }} />
              Generating…
            </>
          ) : (
            <>
              <Sparkles size={12} /> Generate AI draft
            </>
          )}
        </button>
      </div>

      {/* Templates placeholder */}
      <div className="mb-4">
        <details>
          <summary className="text-[11px] cursor-pointer" style={{ color: "var(--tideline)" }}>
            Templates
          </summary>
          <div className="text-[11px] mt-1.5 pl-2" style={{ color: "var(--shell)" }}>
            Templates coming soon.
          </div>
        </details>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={publish}
          disabled={publishing || saving || !draft.trim()}
          className="px-4 py-2 text-xs font-semibold disabled:opacity-50 transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
        >
          {publishing ? "Publishing…" : "Publish reply"}
        </button>
        <button
          type="button"
          onClick={saveDraft}
          disabled={publishing || saving}
          className="px-4 py-2 text-xs font-medium disabled:opacity-50"
          style={{ backgroundColor: "#fff", color: "var(--coastal)", borderRadius: 10, border: "1px solid var(--dry-sand)" }}
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 text-xs font-medium"
          style={{ color: "var(--tideline)" }}
        >
          Cancel
        </button>
      </div>

      {review.incoming_rating != null && review.incoming_rating < 4 && (
        <div className="mt-3 flex items-start gap-2 text-[12px]" style={{ color: "var(--coral-reef)" }}>
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>Bad review — take extra care. Future guests read these replies.</span>
        </div>
      )}
    </div>
  );
}
