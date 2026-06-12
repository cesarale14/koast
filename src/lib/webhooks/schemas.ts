import { z } from "zod";

/**
 * P6.3 — webhook envelope shape guards.
 *
 * Deliberately permissive: they reject grossly malformed bodies (a non-object,
 * or a top-level field present with the wrong type) without coupling to the full
 * provider payload, which evolves. Field-level handling stays in each route;
 * this is just the outer gate so junk never reaches the processing logic.
 */

// Channex sends { event|type, property_id?, payload?: {...} }. All optional so
// the test/ping bodies still pass; the value is rejecting non-objects and
// mistyped top-level keys.
export const channexEnvelopeSchema = z.object({
  event: z.string().optional(),
  type: z.string().optional(),
  property_id: z.string().optional(),
  payload: z.unknown().optional(),
});

// Stripe events are already signature-verified into a typed Stripe.Event; this
// is belt-and-suspenders that id + type are present non-empty strings.
export const stripeEnvelopeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
});
