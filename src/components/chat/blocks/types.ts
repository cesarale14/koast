/**
 * Block payload types for the block→component registry (P2.2).
 *
 * Single source of truth is the pure contract module `@/lib/agent/render/blocks`
 * (Zod schemas + inferred types), shared by the server render lane and these
 * client components. Re-exported here so the block components import from a
 * components-local path.
 *
 * Invariant: the registry contract carries DISPLAY fields only — no entity ids
 * in the read-only render lane. Actionable surfaces (Today, the P2.3
 * ProposalCard) thread ids + handlers through a component's own `actions` prop,
 * not via this Block data.
 */
export type {
  BlockData,
  BlockKind,
  TurnoverBlockData,
  BookingBlockData,
  ThreadBlockData,
  PriceDiffBlockData,
  CalendarChangeBlockData,
  GuestReplyBlockData,
  RuleChangeBlockData,
} from "@/lib/agent/render/blocks";
