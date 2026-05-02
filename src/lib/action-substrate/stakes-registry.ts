/**
 * The stakes registry — the central declaration of every action type
 * the substrate can gate, plus its stakes class.
 *
 * Mutable map (post-M3). Seeded with v1's known entry; tools register
 * additional entries via `registerStakesEntry()` when they declare
 * `requiresGate: true`. The dispatcher does this self-registration
 * automatically; modules outside the agent layer can call
 * `registerStakesEntry()` directly when they need to.
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
 *
 * Naming carry-forward (M3): the seed entry is `memory_fact_write`.
 * For consistency with future tool-naming (verb_object, lowercase
 * snake_case), this should be renamed to `write_memory_fact` in a
 * future migration session. v1 doesn't ship the rename to avoid
 * touching M2 code paths.
 */

export type StakesClass = "low" | "medium" | "high";

/**
 * Action type identifier. Runtime-validated via `getStakesClass()`;
 * the type alias is `string` because tools register dynamically and
 * full compile-time enumeration isn't possible without code
 * generation. Callers pass a known-registered name (e.g.,
 * 'memory_fact_write' from M2, 'read_memory' from M3 read tool's
 * audit path).
 */
export type ActionType = string;

const stakesMap: Map<ActionType, StakesClass> = new Map([
  ["memory_fact_write", "low"],
]);

/**
 * Register an action type → stakes class entry. Idempotent for matching
 * values (no-op when the entry already exists with the same stakes
 * class), throws when the entry exists with a DIFFERENT stakes class
 * — that's a bug indicator (two registrations claim the same
 * action_type with different stakes).
 */
export function registerStakesEntry(actionType: ActionType, stakesClass: StakesClass): void {
  const existing = stakesMap.get(actionType);
  if (existing === undefined) {
    stakesMap.set(actionType, stakesClass);
    return;
  }
  if (existing === stakesClass) {
    return;
  }
  throw new Error(
    `[stakes-registry] Conflicting registration for action_type='${actionType}': existing stakes_class='${existing}', new='${stakesClass}'.`,
  );
}

/**
 * Look up the stakes class for a registered action type. Throws if
 * the action_type isn't registered — substrate callers (requestAction)
 * propagate this as a programming error.
 */
export function getStakesClass(actionType: ActionType): StakesClass {
  const stakes = stakesMap.get(actionType);
  if (stakes === undefined) {
    throw new Error(
      `[stakes-registry] Unknown action_type='${actionType}'. Tool authors must register via registerStakesEntry() before invoking requestAction.`,
    );
  }
  return stakes;
}

/**
 * Returns a snapshot of the current registry. Read-only — mutations
 * must go through registerStakesEntry().
 */
export function getRegisteredStakesEntries(): ReadonlyMap<ActionType, StakesClass> {
  return new Map(stakesMap);
}

/**
 * Test-only: reset the registry to its seed state. Underscore prefix
 * signals don't-use-in-runtime; callers should restrict to
 * `beforeEach()` / `afterEach()` test setup.
 */
export function _resetStakesRegistryForTests(): void {
  stakesMap.clear();
  stakesMap.set("memory_fact_write", "low");
}
