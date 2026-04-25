// Session 6.2 — types + constants for the Airbnb host→guest review
// payload. Lives in its own module because client.ts uses node:crypto
// (server-only) and webpack would otherwise pull that into the
// browser bundle whenever a client component imports the runtime
// constant GUEST_REVIEW_CATEGORIES.

// Outgoing host-review-of-guest categories. Per the Channex docs
// payload example (cleanliness / communication / respect_house_rules)
// — distinct from the incoming review categories (clean / accuracy /
// checkin / communication / location / value). Don't conflate.
export type GuestReviewCategory =
  | "cleanliness"
  | "communication"
  | "respect_house_rules";

export const GUEST_REVIEW_CATEGORIES: GuestReviewCategory[] = [
  "cleanliness",
  "communication",
  "respect_house_rules",
];

export type GuestReviewRating = 1 | 2 | 3 | 4 | 5;

export interface GuestReviewScore {
  category: GuestReviewCategory;
  rating: GuestReviewRating;
}

export interface SubmitGuestReviewPayload {
  scores: GuestReviewScore[];
  public_review: string;
  private_review?: string | null;
  is_reviewee_recommended: boolean;
  tags?: string[] | null;
}

export interface SubmitGuestReviewResult {
  success: boolean;
  channex_response: unknown;
}
