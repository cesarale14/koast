/**
 * Generative-UI render contract (Phase A).
 *
 * The agent emits SEMANTIC, TYPED data — never markdown. The frontend owns
 * presentation. A render payload is the FOURTH turn-level typed payload
 * alongside content_text (prose), tool_calls, and refusal: read-only,
 * host-facing, exactly one per turn, persisted on agent_turns.render and
 * rehydrated into a purpose-built component for BOTH stream and reload.
 *
 * Pure module: Zod + types only, no server/client-only imports — so both the
 * server (sse.ts, conversation.ts) and the client (agent-client, components)
 * import the SAME contract. The discriminated union on `kind` is the growth
 * point: v1 has one member (agenda); future external-data kinds (comp_set,
 * market_research) are new members + new components + new tools.
 *
 * Invariants: NO ids in any payload (host-facing; mirrors the no-ids rule).
 * `v` + `kind` make it forward-compatible — an unknown kind renders nothing
 * (prose stands), per the graceful-degradation principle.
 */
import { z } from "zod";
import { blocksRenderPayloadSchema } from "./blocks";

export const RENDER_HORIZONS = ["today_48h"] as const; // v1; union extends later
export const renderHorizonSchema = z.enum(RENDER_HORIZONS);
export type RenderHorizon = z.infer<typeof renderHorizonSchema>;

const agendaEntrySchema = z.object({
  guest: z.string().nullable(), // null = un-taught/placeholder; rendered by property + action
  date: z.string(),
  numGuests: z.number().int().nullable().optional(),
});

const agendaTurnoverEntrySchema = z.object({
  date: z.string(),
  time: z.string().nullable(),
  cleanerAssigned: z.boolean(),
});

const agendaPropertyGroupSchema = z.object({
  property: z.string(), // nickname only (no ids)
  checkIns: z.array(agendaEntrySchema),
  checkOuts: z.array(agendaEntrySchema),
  turnovers: z.array(agendaTurnoverEntrySchema),
});

// Gaps carry STRUCTURED specifics — the card renders the sentence, the server
// never ships pre-rendered English (server owns data, frontend owns
// presentation). `guest` (awaiting_reply only) follows the same real-first-name
// / null convention as the entries. `date` makes a DATED gap horizon-aware: a
// no_cleaner gap carries its turnover's date so the card can disambiguate (a
// property may have turnovers on different days) and rank today-urgent vs
// upcoming, instead of two `{kind, property}` gaps colliding. missing_essentials
// is property-level (no date); awaiting_reply isn't date-windowed (no date).
const agendaGapSchema = z.object({
  kind: z.enum(["no_cleaner", "missing_essentials", "awaiting_reply"]),
  property: z.string(),
  guest: z.string().nullable().optional(),
  date: z.string().optional(),
});

export const agendaRenderPayloadSchema = z.object({
  v: z.literal(1),
  kind: z.literal("agenda"),
  horizon: renderHorizonSchema,
  today: z.string(),
  groups: z.object({
    today: z.array(agendaPropertyGroupSchema),
    upcoming: z.array(agendaPropertyGroupSchema), // [] when nothing later in-window
  }),
  gaps: z.array(agendaGapSchema),
  nullTzPropertyCount: z.number().int().nonnegative(),
});

/**
 * The render payload union (P2.2: now a real `z.discriminatedUnion("kind",…)`).
 * Members: `agenda` (the operational rollup) and `blocks` (P2.2 — a list of
 * id-lean PMS-component blocks; dormant until a render tool emits it). New
 * render kinds add a member here + a `RenderCard` branch + (where the agent
 * should emit it) a tool. Validate-on-read drops truly-unknown kinds → prose
 * stands.
 */
export const renderPayloadSchema = z.discriminatedUnion("kind", [
  agendaRenderPayloadSchema,
  blocksRenderPayloadSchema,
]);

export type AgendaRenderPayload = z.infer<typeof agendaRenderPayloadSchema>;
export type AgendaPropertyGroup = z.infer<typeof agendaPropertyGroupSchema>;
export type AgendaGap = z.infer<typeof agendaGapSchema>;
export type RenderPayload = z.infer<typeof renderPayloadSchema>;
