/**
 * The action substrate's gating function. Every wrappable action that
 * touches host-visible state should pass through `requestAction()`
 * before executing. The substrate decides:
 *
 *   - whether to allow the action (mode='allow')
 *   - whether to require host confirmation (mode='require_confirmation')
 *   - whether to block the action (mode='block')
 *
 * It also writes one row to `agent_audit_log` per call with
 * `outcome='pending'`. The caller is expected to invoke
 * `updateAuditOutcome()` (from audit-writer.ts) after the side effect
 * resolves to mark the row 'succeeded' or 'failed'.
 *
 * v1 gating logic:
 *   - source='agent_artifact' AND context.artifact_id present:
 *     return mode='allow' with autonomy_level='confirmed'.
 *     This is the "this call IS the gate" pattern from design §7.1 —
 *     the host has already confirmed via the artifact UI.
 *   - Otherwise: lookup stakes class for action_type.
 *     - 'low'    → mode='allow', autonomy_level='silent'
 *     - 'medium' → mode='require_confirmation', autonomy_level='blocked'
 *     - 'high'   → mode='require_confirmation', autonomy_level='blocked'
 *
 * Future milestones extend this logic with per-host calibration
 * (host_action_patterns table from design §7.3) and action-specific
 * gates (env flags for Channex pushes, etc.).
 *
 * Caller contract: see audit-writer.ts.
 */

import type {
  AgentAuditLogActorKind,
  AgentAuditLogAutonomyLevel,
  AgentAuditLogSource,
} from "@/lib/db/schema";
import { writeAuditLog } from "./audit-writer";
import { getStakesClass, type ActionType, type StakesClass } from "./stakes-registry";

export type RequestActionMode = "allow" | "block" | "require_confirmation";

export interface RequestActionInput {
  host_id: string;
  action_type: ActionType;
  payload: Record<string, unknown>;
  source: AgentAuditLogSource;
  actor_id: string | null;
  context: Record<string, unknown> | null;
}

export interface RequestActionAuditMetadata {
  audit_log_id: string;
  autonomy_level: AgentAuditLogAutonomyLevel;
  actor_kind: AgentAuditLogActorKind;
  stakes_class: StakesClass;
  created_at: string;
}

export interface RequestActionResult {
  mode: RequestActionMode;
  reason: string;
  audit_metadata: RequestActionAuditMetadata;
}

/**
 * Map a request's `source` to the audit feed's `actor_kind` enum.
 *   - frontend_api → host (the route is acting on behalf of the host)
 *   - agent_artifact → agent (the artifact was emitted by the agent;
 *                              host's confirmation routes the action
 *                              through the agent's autonomy)
 *   - agent_tool → agent
 *   - worker → worker
 */
function actorKindForSource(source: AgentAuditLogSource): AgentAuditLogActorKind {
  switch (source) {
    case "frontend_api":
      return "host";
    case "agent_artifact":
    case "agent_tool":
      return "agent";
    case "worker":
      return "worker";
  }
}

function isAgentArtifactBypass(input: RequestActionInput): boolean {
  if (input.source !== "agent_artifact") return false;
  const artifactId = input.context?.artifact_id;
  return typeof artifactId === "string" && artifactId.length > 0;
}

export async function requestAction(
  input: RequestActionInput,
): Promise<RequestActionResult> {
  const stakesClass = getStakesClass(input.action_type);
  const actorKind = actorKindForSource(input.source);

  let mode: RequestActionMode;
  let autonomyLevel: AgentAuditLogAutonomyLevel;
  let reason: string;

  if (isAgentArtifactBypass(input)) {
    mode = "allow";
    autonomyLevel = "confirmed";
    reason = `Host confirmation routed through artifact ${input.context?.artifact_id}; substrate treats this call as the gate.`;
  } else {
    switch (stakesClass) {
      case "low":
        mode = "allow";
        autonomyLevel = "silent";
        reason = `Action '${input.action_type}' is low-stakes (reversible); substrate allows silent execution.`;
        break;
      case "medium":
      case "high":
        mode = "require_confirmation";
        autonomyLevel = "blocked";
        reason = `Action '${input.action_type}' is ${stakesClass}-stakes; substrate requires explicit host confirmation before proceeding.`;
        break;
    }
  }

  // Write the audit row with outcome='pending'. Caller resolves the
  // outcome via updateAuditOutcome() after the side effect resolves.
  const { audit_log_id, created_at } = await writeAuditLog({
    host_id: input.host_id,
    action_type: input.action_type,
    payload: input.payload,
    source: input.source,
    actor_kind: actorKind,
    actor_id: input.actor_id,
    autonomy_level: autonomyLevel,
    outcome: "pending",
    context: input.context,
    stakes_class: stakesClass,
  });

  return {
    mode,
    reason,
    audit_metadata: {
      audit_log_id,
      autonomy_level: autonomyLevel,
      actor_kind: actorKind,
      stakes_class: stakesClass,
      created_at,
    },
  };
}
