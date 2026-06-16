/**
 * Block contracts (P2.2) — the typed, id-LEAN payloads the block→component
 * registry renders, and the `blocks` render-payload kind that lets the agent's
 * read-only render lane carry them.
 *
 * Pure module (Zod + types only, no server/client imports) so the server
 * (render lane / SSE) and the client (the block components) share ONE contract,
 * exactly like the agenda render payload. The block components live in
 * src/components/chat/blocks/ and import these types.
 *
 * Invariant (mirrors render/types.ts): NO entity ids in any block — these are
 * host-facing, read-only display payloads. An actionable surface (Today, a P2.3
 * ProposalCard) threads ids + handlers through the component's own props
 * out-of-band, never through the agent-emitted Block data.
 *
 * The `blocks` render kind is registered here but DORMANT until a render tool
 * emits it (P3, the agent's hands) — adding it now is purely additive: agenda
 * payloads are unaffected and validate-on-read still drops truly-unknown kinds.
 */
import { z } from "zod";

export const turnoverBlockDataSchema = z.object({
  property: z.string(),
  date: z.string(), // YYYY-MM-DD
  status: z.enum(["pending", "assigned", "in_progress", "completed", "issue"]),
  cleanerName: z.string().nullable(),
  photoCount: z.number().int().nonnegative().optional(),
});

export const bookingBlockDataSchema = z.object({
  guestName: z.string().nullable(),
  checkIn: z.string(),
  checkOut: z.string(),
  platform: z.string(),
  totalPrice: z.number().nullable().optional(),
  numGuests: z.number().int().nullable().optional(),
  propertyName: z.string().nullable().optional(),
});

export const threadBlockDataSchema = z.object({
  guestName: z.string().nullable(),
  propertyName: z.string().nullable(),
  platform: z.string().nullable(),
  lastMessage: z.string().nullable(),
  lastMessageAt: z.string().nullable().optional(),
  unreadCount: z.number().int().nonnegative().optional(),
});

export const priceDiffBlockDataSchema = z.object({
  date: z.string(),
  currentRate: z.number().nullable(),
  suggestedRate: z.number().nullable(),
  deltaAbs: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
  urgency: z.enum(["act_now", "coming_up", "review"]).nullable().optional(),
});

/**
 * calendar_change (P3.2 OTA trio) — the display block for a proposed OTA write:
 * block a date (availability=0), adjust a price, or set a min-stay. Id-lean like
 * every block: the proposal's `action` payload (entity ids, channel) is what
 * EXECUTES; this is only what the host SEES on the ProposalCard.
 */
export const calendarChangeBlockDataSchema = z.object({
  property: z.string(),
  /** First/only date, YYYY-MM-DD. */
  date: z.string(),
  change: z.enum(["block", "price", "min_stay"]),
  /** price → dollar rate; min_stay → nights; block → null. */
  value: z.number().nullable().optional(),
  /** Dates spanned when >1 (renders "3 nights"); omit/1 for a single date. */
  dateCount: z.number().int().positive().nullable().optional(),
  /** P7: the underlying rec is low-confidence (insufficient comp set) — the card
   * renders an "Early estimate" chip so a new host's first auto-proposals read
   * as estimates, not confident calls. */
  lowConfidence: z.boolean().optional(),
});

/**
 * guest_reply (P3.2 send_guest_reply) — the display block for a proposed guest
 * message send: the channel, who it's to, and the DRAFTED reply text the host
 * reads before approving. Id-lean like every block — the proposal's `action`
 * payload (booking id) is what EXECUTES; this is only what the host SEES on the
 * ProposalCard. `messageText` is the post-J1-filter (emoji-clean) draft that
 * will actually be sent on approval.
 */
export const guestReplyBlockDataSchema = z.object({
  /** Canonical channel label: 'airbnb' | 'booking_com' | 'vrbo' | 'direct'. */
  channel: z.string(),
  guestName: z.string().nullable(),
  propertyName: z.string().nullable(),
  /** The drafted reply (post voice-judge filter) the host approves to send. */
  messageText: z.string(),
});

/**
 * rule_change (P4.1) — the display block for a proposed pricing-RULE change (e.g.
 * raise the inferred max_rate ceiling the engine detected sits below market). The
 * P4.1 fix surfaces the ceiling-binding conflict; this is how the host approves
 * raising their OWN guardrail (propose→approve like every other write). Id-lean:
 * the proposal's `action` payload (property id + patch) is what EXECUTES; this is
 * only what the host SEES.
 */
export const ruleChangeBlockDataSchema = z.object({
  property: z.string(),
  /** Which rule bound is changing. */
  field: z.enum(["max_rate", "min_rate", "base_rate"]),
  /** Human label, e.g. "Maximum rate". */
  label: z.string(),
  /** Current value (null if the rule row had none). */
  oldValue: z.number().nullable(),
  /** Proposed new value. */
  newValue: z.number(),
});

export const blockDataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("turnover"), data: turnoverBlockDataSchema }),
  z.object({ kind: z.literal("booking"), data: bookingBlockDataSchema }),
  z.object({ kind: z.literal("thread"), data: threadBlockDataSchema }),
  z.object({ kind: z.literal("price_diff"), data: priceDiffBlockDataSchema }),
  z.object({ kind: z.literal("calendar_change"), data: calendarChangeBlockDataSchema }),
  z.object({ kind: z.literal("guest_reply"), data: guestReplyBlockDataSchema }),
  z.object({ kind: z.literal("rule_change"), data: ruleChangeBlockDataSchema }),
]);

/** A render-payload kind carrying a list of blocks (dormant until a render tool emits it). */
export const blocksRenderPayloadSchema = z.object({
  v: z.literal(1),
  kind: z.literal("blocks"),
  blocks: z.array(blockDataSchema),
});

export type TurnoverBlockData = z.infer<typeof turnoverBlockDataSchema>;
export type BookingBlockData = z.infer<typeof bookingBlockDataSchema>;
export type ThreadBlockData = z.infer<typeof threadBlockDataSchema>;
export type PriceDiffBlockData = z.infer<typeof priceDiffBlockDataSchema>;
export type CalendarChangeBlockData = z.infer<typeof calendarChangeBlockDataSchema>;
export type GuestReplyBlockData = z.infer<typeof guestReplyBlockDataSchema>;
export type RuleChangeBlockData = z.infer<typeof ruleChangeBlockDataSchema>;
export type BlockData = z.infer<typeof blockDataSchema>;
export type BlockKind = BlockData["kind"];
export type BlocksRenderPayload = z.infer<typeof blocksRenderPayloadSchema>;
