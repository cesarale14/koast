"use client";

/**
 * The block→component registry (P2.2). Maps a typed, id-lean BlockData to the
 * real PMS component — so "answers are made of the app's own components," never
 * a bespoke chat-only text summary. This is the formalized successor to
 * RenderCard's single switch: read-only by design (the agent's render lane is
 * id-free). Actionable surfaces render the underlying component directly with
 * their own `actions` (e.g. TodayTurnovers → TurnoverBlock with assign wired,
 * the P2.3 ProposalCard with Approve on the frame).
 *
 * Graceful degradation: an unknown/future kind renders nothing (the prose
 * stands), matching the render-payload contract.
 */

import type { BlockData } from "./types";
import { TurnoverBlock } from "./TurnoverBlock";
import { BookingBlock } from "./BookingBlock";
import { ThreadBlock } from "./ThreadBlock";
import { PriceDiffBlock } from "./PriceDiffBlock";
import { CalendarChangeBlock } from "./CalendarChangeBlock";
import { GuestReplyBlock } from "./GuestReplyBlock";

export function Block({ block }: { block: BlockData }) {
  switch (block.kind) {
    case "turnover":
      return <TurnoverBlock data={block.data} />;
    case "booking":
      return <BookingBlock data={block.data} />;
    case "thread":
      return <ThreadBlock data={block.data} />;
    case "price_diff":
      return <PriceDiffBlock data={block.data} />;
    case "calendar_change":
      return <CalendarChangeBlock data={block.data} />;
    case "guest_reply":
      return <GuestReplyBlock data={block.data} />;
  }
  // Exhaustive today; a future kind (validated away upstream) renders nothing.
  return null;
}

/** Render a list of blocks with consistent spacing (the `blocks` render kind). */
export function BlockList({ blocks }: { blocks: BlockData[] }) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}
