/**
 * The stakes registry — the central declaration of every action type
 * the substrate can gate, plus its stakes class.
 *
 * v1 holds one entry: `memory_fact_write`. Future milestones widen
 * the registry as more wrappable actions land (pricing.apply,
 * message.send, booking.cancel, etc., per design doc §7.2).
 */

export type StakesClass = "low" | "medium" | "high";

/**
 * v1: the only registered action is the memory fact write. Adding new
 * action types is a one-line change here plus a corresponding entry
 * in `stakesRegistry`.
 */
export type ActionType = "memory_fact_write";

/**
 * Map from action type to stakes class. The substrate consults this
 * when deciding whether to gate a request through host confirmation.
 *
 * Stakes class semantics at v1:
 *   - 'low'    → action is reversible / cheap to undo. Substrate may
 *                allow autonomous execution when the calling source
 *                doesn't explicitly require confirmation.
 *   - 'medium' → action has user-visible side effects. Substrate
 *                requires confirmation by default.
 *   - 'high'   → action is irreversible or has external consequences.
 *                Substrate requires confirmation; future milestones
 *                may add additional gates (env flags, two-step etc.).
 */
export const stakesRegistry: Record<ActionType, StakesClass> = {
  memory_fact_write: "low",
};

export function getStakesClass(actionType: ActionType): StakesClass {
  return stakesRegistry[actionType];
}
