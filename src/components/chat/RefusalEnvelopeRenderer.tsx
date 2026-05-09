/**
 * F4 — RefusalEnvelopeRenderer (M8 Phase D, D18).
 *
 * Renders a RefusalEnvelope inside a chat turn. Sibling to text and
 * pendingArtifacts in the turn body; not an artifact (artifacts are
 * gated actions awaiting approval; refusals are completed terminal
 * turn content).
 *
 * Visual treatment per F4 sign-off (Decision 3):
 *   - Subdued card: hairline border on white, no color-coding by kind.
 *   - No icons, no chrome decoration. Visual weight comes from the
 *     envelope's place in the conversation, not from a badge or color.
 *   - "Never red for non-finance" rule applies — refusals aren't errors.
 *
 * M8 generation scope: P4 generates hard_refusal only at
 * propose_guest_message. soft_refusal + host_input_needed render
 * correctly when produced by future surfaces (M9 broadens generation).
 *
 * Voice doctrine bindings: §4.1 (three flavors), §4.2 (hard pattern
 * shape), §4.4 (host_input_needed shape), §4.3 (banned anti-patterns).
 * Copy lives in src/lib/agent/refusal-envelope.ts at the helper
 * boundary; this component is presentation-only.
 */

import type { RefusalEnvelope } from "@/lib/agent/refusal-envelope";

export function RefusalEnvelopeRenderer({
  envelope,
}: {
  envelope: RefusalEnvelope;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--hairline)] bg-white p-4 max-w-prose">
      <p className="text-[14px] leading-[1.5] text-[var(--coastal)] font-medium">
        {envelope.reason}
      </p>
      {envelope.alternative_path && (
        <p className="mt-2 text-[13px] leading-[1.5] text-[var(--tideline)]">
          {envelope.alternative_path}
        </p>
      )}
      {envelope.kind === "host_input_needed" &&
        envelope.missing_inputs &&
        envelope.missing_inputs.length > 0 && (
          <ul className="mt-2 pl-4 list-disc text-[13px] text-[var(--tideline)] space-y-0.5">
            {envelope.missing_inputs.map((input) => (
              <li key={input}>{input}</li>
            ))}
          </ul>
        )}
      {envelope.kind === "host_input_needed" &&
        envelope.suggested_inputs &&
        envelope.suggested_inputs.length > 0 && (
          <p className="mt-2 text-[12px] text-[var(--tideline)] italic">
            For example: {envelope.suggested_inputs.join(", ")}
          </p>
        )}
      {/* soft_refusal override button intentionally omitted per F4
          Decision 6 (β): M9 ships button + handler together. */}
    </div>
  );
}
