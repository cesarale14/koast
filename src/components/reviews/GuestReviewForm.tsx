"use client";

import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ui/Toast";
import { X, Sparkles, AlertTriangle } from "lucide-react";
import {
  GUEST_REVIEW_CATEGORIES,
  type GuestReviewCategory,
  type GuestReviewRating,
} from "@/lib/channex/guest-review-types";
import {
  GUEST_REVIEW_PUBLIC_MIN,
  GUEST_REVIEW_PUBLIC_MAX,
  GUEST_REVIEW_PRIVATE_MAX,
} from "@/lib/reviews/guest-review-validation";
import type { ReviewCardModel } from "@/lib/reviews/types";

const CATEGORY_LABELS: Record<GuestReviewCategory, string> = {
  cleanliness: "Cleanliness",
  communication: "Communication",
  respect_house_rules: "Respect for house rules",
};

interface GuestReviewFormProps {
  review: ReviewCardModel;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function GuestReviewForm({ review, onClose, onSubmitted }: GuestReviewFormProps) {
  const { toast } = useToast();
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [scores, setScores] = useState<Partial<Record<GuestReviewCategory, GuestReviewRating>>>({});
  const [publicReview, setPublicReview] = useState("");
  const [privateReview, setPrivateReview] = useState("");
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dirty = useMemo(
    () =>
      recommend !== null ||
      Object.keys(scores).length > 0 ||
      publicReview.length > 0 ||
      privateReview.length > 0,
    [recommend, scores, publicReview, privateReview],
  );

  const allCategoriesRated = GUEST_REVIEW_CATEGORIES.every((c) => scores[c]);
  const publicValid =
    publicReview.trim().length >= GUEST_REVIEW_PUBLIC_MIN &&
    publicReview.trim().length <= GUEST_REVIEW_PUBLIC_MAX;
  const privateValid = privateReview.length <= GUEST_REVIEW_PRIVATE_MAX;
  const canSubmit = recommend !== null && allCategoriesRated && publicValid && privateValid && !submitting;

  const tryClose = () => {
    if (submitting) return;
    if (dirty && !window.confirm("Discard this draft? Your changes won't be saved.")) return;
    onClose();
  };

  const generateDraft = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/reviews/generate-guest-review/${review.id}`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? `Failed (${res.status})`);
      if (payload.public_review_draft) setPublicReview(payload.public_review_draft);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setGenerating(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const body = {
        scores: GUEST_REVIEW_CATEGORIES.map((c) => ({ category: c, rating: scores[c]! })),
        public_review: publicReview.trim(),
        private_review: privateReview.trim() || null,
        is_reviewee_recommended: recommend === true,
        tags: null,
      };
      const res = await fetch(`/api/reviews/submit-guest-review/${review.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = payload.details ? ` (${JSON.stringify(payload.details)})` : "";
        throw new Error((payload.error ?? `Failed (${res.status})`) + detail);
      }
      toast("Review submitted. Airbnb typically confirms within 5-15 minutes.");
      setConfirmOpen(false);
      onSubmitted();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const summarySnippet = publicReview.trim().slice(0, 80) + (publicReview.trim().length > 80 ? "…" : "");
  const pubLen = publicReview.trim().length;

  // Portal-render to document.body so the modal escapes any ancestor
  // that has `transform` / `filter` / `contain` set, which otherwise
  // clips a position:fixed element to that ancestor's box.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const node = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(19,46,32,0.45)" }}
      onClick={tryClose}
    >
      <div
        className="w-full bg-white"
        style={{ maxWidth: 600, borderRadius: 16, boxShadow: "var(--shadow-card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5" style={{ borderBottom: "1px solid var(--dry-sand)" }}>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--golden)" }}>
              Guest review
            </div>
            <div className="text-[16px] font-semibold mt-0.5" style={{ color: "var(--coastal)" }}>
              Review {review.display_guest_name}
            </div>
            <div className="text-[12px] mt-1" style={{ color: "var(--tideline)" }}>
              This review will be submitted to Airbnb. Once submitted, it cannot be edited.
            </div>
          </div>
          <button type="button" onClick={tryClose} aria-label="Close" className="p-1 rounded hover:bg-shore" style={{ color: "var(--tideline)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Section 1 — recommendation */}
          <div>
            <div className="text-[13px] font-semibold mb-2" style={{ color: "var(--coastal)" }}>
              Would you host this guest again?
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRecommend(true)}
                className="flex-1 px-4 py-3 text-[13px] font-semibold transition-colors"
                style={{
                  borderRadius: 10,
                  border: recommend === true ? "1px solid var(--lagoon)" : "1px solid var(--dry-sand)",
                  background: recommend === true ? "rgba(26,122,90,0.1)" : "#fff",
                  color: recommend === true ? "var(--lagoon)" : "var(--tideline)",
                }}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setRecommend(false)}
                className="flex-1 px-4 py-3 text-[13px] font-semibold transition-colors"
                style={{
                  borderRadius: 10,
                  border: recommend === false ? "1px solid var(--coral-reef)" : "1px solid var(--dry-sand)",
                  background: recommend === false ? "rgba(196,64,64,0.1)" : "#fff",
                  color: recommend === false ? "var(--coral-reef)" : "var(--tideline)",
                }}
              >
                No
              </button>
            </div>
          </div>

          {/* Section 2 — category ratings */}
          <div>
            <div className="text-[13px] font-semibold mb-2" style={{ color: "var(--coastal)" }}>
              Rate this guest
            </div>
            <div className="space-y-2">
              {GUEST_REVIEW_CATEGORIES.map((cat) => (
                <div key={cat} className="flex items-center justify-between">
                  <span className="text-[13px]" style={{ color: "var(--tideline)" }}>
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <div className="flex items-center gap-1">
                    {([1, 2, 3, 4, 5] as const).map((n) => {
                      const active = (scores[cat] ?? 0) >= n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setScores({ ...scores, [cat]: n })}
                          className="text-[18px] font-mono cursor-pointer"
                          style={{ color: active ? "var(--golden)" : "var(--shell)" }}
                          aria-label={`${CATEGORY_LABELS[cat]} ${n} of 5`}
                        >
                          ★
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3 — public review */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[13px] font-semibold" style={{ color: "var(--coastal)" }}>
                Public review
              </label>
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
            <textarea
              value={publicReview}
              onChange={(e) => setPublicReview(e.target.value)}
              rows={5}
              placeholder="Write a balanced review. This appears on the guest's Airbnb profile."
              className="w-full px-3 py-2 text-[13px] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-golden/30"
              style={{ border: "1px solid var(--dry-sand)", color: "var(--coastal)" }}
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px]" style={{ color: "var(--tideline)" }}>
                Appears on the guest&apos;s Airbnb profile.
              </span>
              <span
                className="text-[11px] font-mono"
                style={{
                  color:
                    pubLen < GUEST_REVIEW_PUBLIC_MIN || pubLen > GUEST_REVIEW_PUBLIC_MAX
                      ? "var(--coral-reef)"
                      : "var(--tideline)",
                }}
              >
                {pubLen} / {GUEST_REVIEW_PUBLIC_MIN}–{GUEST_REVIEW_PUBLIC_MAX}
              </span>
            </div>
          </div>

          {/* Section 4 — private feedback */}
          <div>
            <label className="text-[13px] font-semibold mb-1 block" style={{ color: "var(--coastal)" }}>
              Private feedback to Airbnb (optional)
            </label>
            <textarea
              value={privateReview}
              onChange={(e) => setPrivateReview(e.target.value)}
              rows={3}
              placeholder="Only Airbnb sees this. Not shown to the guest."
              className="w-full px-3 py-2 text-[13px] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-golden/30"
              style={{ border: "1px solid var(--dry-sand)", color: "var(--coastal)" }}
            />
            <div className="text-[11px] mt-1" style={{ color: "var(--tideline)" }}>
              {privateReview.length} / {GUEST_REVIEW_PRIVATE_MAX}
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11px] p-3" style={{ background: "rgba(212,150,11,0.08)", borderRadius: 10, color: "var(--amber-tide)" }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              Channex&apos;s API accepts payloads even if Airbnb later rejects them. After submit, the card will show
              &quot;Submitted, pending&quot; until a sync confirms Airbnb received it.
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between p-5 gap-2" style={{ borderTop: "1px solid var(--dry-sand)" }}>
          <button
            type="button"
            onClick={tryClose}
            disabled={submitting}
            className="px-4 py-2 text-[12px] font-medium"
            style={{ color: "var(--tideline)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!canSubmit}
            className="px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
          >
            Submit to Airbnb
          </button>
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          style={{ background: "rgba(19,46,32,0.55)" }}
          onClick={() => !submitting && setConfirmOpen(false)}
        >
          <div
            className="w-full bg-white p-5"
            style={{ maxWidth: 420, borderRadius: 14, boxShadow: "var(--shadow-card)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--coastal)" }}>
              Submit review for {review.display_guest_name}?
            </div>
            <div className="text-[12px] mb-3" style={{ color: "var(--tideline)" }}>
              This can&apos;t be undone.
            </div>
            <div className="space-y-2 p-3 mb-4" style={{ background: "var(--shore)", borderRadius: 10 }}>
              <div className="text-[12px]" style={{ color: "var(--coastal)" }}>
                <strong>Recommend:</strong> {recommend ? "Yes" : "No"}
              </div>
              <div className="text-[12px]" style={{ color: "var(--coastal)" }}>
                <strong>Ratings:</strong>{" "}
                {GUEST_REVIEW_CATEGORIES.map((c) => `${CATEGORY_LABELS[c]} ${scores[c]}/5`).join(" · ")}
              </div>
              <div className="text-[12px]" style={{ color: "var(--coastal)" }}>
                <strong>Public:</strong> &quot;{summarySnippet}&quot;
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                className="px-4 py-2 text-[12px] font-medium"
                style={{ color: "var(--tideline)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
                style={{ backgroundColor: "var(--coastal)", color: "var(--shore)", borderRadius: 10 }}
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(node, document.body);
}
