/**
 * Custom error classes for post-approval handlers.
 *
 * Distinct error types let the /api/agent/artifact route apply the
 * right failure-handling pattern per cause:
 *   - `ChannexSendError`         (from src/lib/channex/messages.ts) →
 *     M7 §6 amendment encoding (state stays 'emitted', commit_metadata.
 *     last_error populated, audit outcome='failed'). Channex was
 *     reached; the OTA rejected. Try-again often resolves transient
 *     failures (network, brief API hiccup).
 *   - `ColdSendUnsupportedError` (this file) → same §6 encoding shape,
 *     but distinct SSE error code ('cold_send_unsupported') and
 *     `last_error.channex_status: null` because Channex was never
 *     called. The handler refused to dispatch because of a local
 *     constraint (no channex_booking_id, no property_channels row,
 *     iCal-import sentinel, ABB cold-send blocked pending CF #45).
 *   - Other errors                                                 →
 *     M6 outer-catch / dismissed pattern (artifact terminal-state
 *     'dismissed'; the host re-prompts). Reserved for genuinely
 *     unrecoverable failures: unknown booking, unauthorized host,
 *     malformed payload — situations where Try-again can't help.
 *
 * Adding new gate constraints (e.g. CF #45's ABB channel_id work):
 * extend the `ColdSendGate` union and throw `ColdSendUnsupportedError`
 * with the new gate identifier. Route-side handling Just Works.
 */

/**
 * Identifier for which pre-flight gate refused the cold-send.
 * Pinned to a controlled vocabulary so audit trail / future analytics
 * can tally constraints by category without grepping error messages.
 */
export type ColdSendGate =
  | "no-channex-booking" // G1 — booking.channex_booking_id is null (pure iCal)
  | "no-property-channel" // G2 — no property_channels row for (property, platform)
  | "ical-import" // G3 — channex_channel_id is the 'ical-' sentinel
  | "abb-cold-send-cf45"; // G4 — ABB cold-send pending channel_id-in-body work (CF #45)

/**
 * Cold-send refused by a local pre-flight gate. Channex was not
 * called. Routes to M7 §6 failure encoding with a distinct SSE
 * error code so the chat shell can surface meaningful copy without
 * conflating with Channex-side rejections.
 */
export class ColdSendUnsupportedError extends Error {
  /** Which gate refused the dispatch. */
  gate: ColdSendGate;
  /**
   * Whether Try-again COULD succeed under some host action that's
   * not just "retry the same proposal." Carried for future use; M7
   * v1's failed-state UI renders Try-again unconditionally. Most
   * gates here are FALSE (Try-again does nothing without external
   * configuration changes), but G4 will become true once CF #45
   * lands.
   */
  recoverable: boolean;

  constructor(
    message: string,
    gate: ColdSendGate,
    options: { recoverable?: boolean } = {},
  ) {
    super(message);
    this.name = "ColdSendUnsupportedError";
    this.gate = gate;
    this.recoverable = options.recoverable ?? false;
  }
}
