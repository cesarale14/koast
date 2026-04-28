// Shared type for /api/reviews/pending entries. Used by every
// reviews-render component plus the host→guest counter-review modal.

export interface ReviewListEntry {
  id: string;
  property_id: string;
  property_name: string;
  // RDX-5 — property photo for the avatar slot. Nullable; render
  // falls back to a generic house icon when absent.
  property_cover_photo_url: string | null;
  channex_review_id: string | null;
  guest_name: string | null;
  guest_name_override: string | null;
  display_guest_name: string;
  guest_review_submitted_at: string | null;
  guest_review_channex_acked_at: string | null;
  guest_review_airbnb_confirmed_at: string | null;
  expired_at: string | null;
  is_expired: boolean;
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
  // RDX-4 decomposed flags. UI predicate: is_low_rating || is_flagged_by_host.
  is_low_rating: boolean;
  is_flagged_by_host: boolean;
  // Session 6.7 — pre-disclosure flag from Channex /reviews
  // attributes.is_hidden. True while the 14-day disclosure window is
  // open. UI predicate: render "Awaiting guest review" state when true.
  is_hidden: boolean;
  platform: string;
  booking_check_in: string | null;
  booking_check_out: string | null;
  booking_nights: number | null;
  booking_platform_booking_id: string | null;
}

// Backwards-compat alias for GuestReviewForm + any external import.
// The old ReviewCard.tsx exported this name; preserve it through the
// rebuild so callers don't need a coordinated update.
export type ReviewCardModel = ReviewListEntry;
