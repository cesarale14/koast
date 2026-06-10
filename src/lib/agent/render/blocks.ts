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

export const blockDataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("turnover"), data: turnoverBlockDataSchema }),
  z.object({ kind: z.literal("booking"), data: bookingBlockDataSchema }),
  z.object({ kind: z.literal("thread"), data: threadBlockDataSchema }),
  z.object({ kind: z.literal("price_diff"), data: priceDiffBlockDataSchema }),
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
export type BlockData = z.infer<typeof blockDataSchema>;
export type BlockKind = BlockData["kind"];
export type BlocksRenderPayload = z.infer<typeof blocksRenderPayloadSchema>;
