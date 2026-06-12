/**
 * Client-safe proposal wire schema. Lives apart from `proposals/server.ts`
 * (which pulls Channex + handler deps that must never reach the client bundle)
 * so BOTH the server SSE emitter (`agent/sse.ts`) and the client SSE validator
 * (`agent-client/types.ts`) can validate the `proposal_created` event against one
 * source of truth — no drift between the two event-union copies.
 *
 * Mirrors the NormalizedProposal shape `ProposalCard` consumes; the block reuses
 * the render-lane block schema (id-lean, validated-on-read).
 */
import { z } from "zod";
import { blockDataSchema } from "@/lib/agent/render/blocks";

export const normalizedProposalSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  actionType: z.string(),
  block: blockDataSchema.nullable(),
  rationale: z.string().nullable(),
  status: z.enum(["pending", "approved", "dismissed", "executed", "failed"]),
  result: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  otaTouching: z.boolean(),
  executable: z.boolean(),
});

/** Card-facing normalized proposal (camelCase; carries the display block). */
export type NormalizedProposal = z.infer<typeof normalizedProposalSchema>;
