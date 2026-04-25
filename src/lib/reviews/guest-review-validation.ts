// Session 6.2 — pure validation for Airbnb host→guest review payloads.
// Reused on both client and server. Channex returns 200 for any
// shape-correct payload regardless of category names or rating ranges
// (Airbnb silently rejects downstream), so this is the real gatekeeper.

import {
  GUEST_REVIEW_CATEGORIES,
  type GuestReviewCategory,
  type SubmitGuestReviewPayload,
} from "@/lib/channex/client";

export const GUEST_REVIEW_PUBLIC_MIN = 50;
export const GUEST_REVIEW_PUBLIC_MAX = 1000;
export const GUEST_REVIEW_PRIVATE_MAX = 1000;

export interface GuestReviewValidationError {
  field: string;
  message: string;
}

export function validateGuestReviewPayload(
  raw: unknown,
): { ok: true; payload: SubmitGuestReviewPayload } | { ok: false; errors: GuestReviewValidationError[] } {
  const errors: GuestReviewValidationError[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: [{ field: "body", message: "Body is required" }] };
  }
  const body = raw as Record<string, unknown>;

  // is_reviewee_recommended
  const recommended = body.is_reviewee_recommended;
  if (typeof recommended !== "boolean") {
    errors.push({ field: "is_reviewee_recommended", message: "Must be a boolean" });
  }

  // public_review
  const pub = typeof body.public_review === "string" ? body.public_review.trim() : "";
  if (!pub) {
    errors.push({ field: "public_review", message: "Public review is required" });
  } else if (pub.length < GUEST_REVIEW_PUBLIC_MIN) {
    errors.push({ field: "public_review", message: `At least ${GUEST_REVIEW_PUBLIC_MIN} characters` });
  } else if (pub.length > GUEST_REVIEW_PUBLIC_MAX) {
    errors.push({ field: "public_review", message: `At most ${GUEST_REVIEW_PUBLIC_MAX} characters` });
  }

  // private_review (optional)
  const priv = body.private_review;
  let privNorm: string | null = null;
  if (priv != null) {
    if (typeof priv !== "string") {
      errors.push({ field: "private_review", message: "Must be a string" });
    } else if (priv.length > GUEST_REVIEW_PRIVATE_MAX) {
      errors.push({ field: "private_review", message: `At most ${GUEST_REVIEW_PRIVATE_MAX} characters` });
    } else {
      privNorm = priv.trim() || null;
    }
  }

  // scores — every category exactly once, rating 1-5
  const scores = body.scores;
  const scoreEntries: { category: GuestReviewCategory; rating: 1 | 2 | 3 | 4 | 5 }[] = [];
  if (!Array.isArray(scores)) {
    errors.push({ field: "scores", message: "Must be an array" });
  } else {
    const seen = new Set<string>();
    for (const s of scores) {
      if (!s || typeof s !== "object") {
        errors.push({ field: "scores", message: "Each entry must be an object" });
        continue;
      }
      const entry = s as Record<string, unknown>;
      const cat = entry.category;
      const rating = entry.rating;
      if (typeof cat !== "string" || !GUEST_REVIEW_CATEGORIES.includes(cat as GuestReviewCategory)) {
        errors.push({ field: "scores.category", message: `Unknown category "${String(cat)}"` });
        continue;
      }
      if (seen.has(cat)) {
        errors.push({ field: "scores.category", message: `Duplicate category "${cat}"` });
        continue;
      }
      if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        errors.push({ field: "scores.rating", message: `Rating for "${cat}" must be integer 1-5` });
        continue;
      }
      seen.add(cat);
      scoreEntries.push({ category: cat as GuestReviewCategory, rating: rating as 1 | 2 | 3 | 4 | 5 });
    }
    for (const required of GUEST_REVIEW_CATEGORIES) {
      if (!seen.has(required)) {
        errors.push({ field: "scores", message: `Missing rating for "${required}"` });
      }
    }
  }

  // tags (optional, free-form for now — Airbnb's enumerated list is not
  // wired in this session)
  const tags = body.tags;
  let tagsNorm: string[] | null = null;
  if (tags != null) {
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string")) {
      errors.push({ field: "tags", message: "Must be an array of strings" });
    } else {
      tagsNorm = tags as string[];
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    payload: {
      scores: scoreEntries,
      public_review: pub,
      private_review: privNorm,
      is_reviewee_recommended: recommended as boolean,
      tags: tagsNorm,
    },
  };
}
