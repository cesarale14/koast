/**
 * RenderCard — the generative-UI render dispatcher.
 *
 * Maps a typed RenderPayload (kind) to a purpose-built component. Renders the
 * SAME way for a live-streamed turn and a reloaded one (the payload lives on
 * agent_turns.render and rehydrates via loadTurnsForConversation), so a card
 * that works during stream automatically survives reload.
 *
 * Forward-compatible / graceful degradation: an unknown/future kind renders
 * NOTHING (the prose stands). Prose is always the canonical content; the card
 * is an enhancement, never the only path.
 */
import type { RenderPayload } from "@/lib/agent/render/types";
import { AgendaCard } from "./AgendaCard";
import { BlockList } from "./blocks/registry";

export function RenderCard({ payload }: { payload: RenderPayload }) {
  switch (payload.kind) {
    case "agenda":
      return <AgendaCard payload={payload} />;
    case "blocks":
      // P2.2: answers composed of the app's own components via the registry.
      return <BlockList blocks={payload.blocks} />;
    default:
      // Unknown kind → render nothing; the prose carries the turn.
      return null;
  }
}
