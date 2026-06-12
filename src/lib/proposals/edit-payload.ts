/**
 * P6.5 — pure payload merge for a send_guest_reply edit. The edited (and
 * re-judged) text replaces `messageText` in BOTH the `action` (what actually
 * sends on approve) and the display `block` (what the host sees), and returns
 * the prior text so the caller can audit-log original → final. Pure (no deps) so
 * the edit→send path is deterministically unit-tested without mocking the judges.
 *
 * `judge_results` is NOT set here — the route attaches the fresh envelope's
 * judge_results after re-running applyOutputJudges.
 */
export function applyGuestReplyEdit(
  prevPayload: Record<string, unknown> | null,
  finalText: string,
): { nextPayload: Record<string, unknown>; originalText: string | null } {
  const prev = (prevPayload ?? {}) as {
    block?: { kind?: string; data?: Record<string, unknown> };
    action?: Record<string, unknown>;
    [k: string]: unknown;
  };
  const originalText =
    (prev.action?.messageText as string | undefined) ??
    (prev.block?.data?.messageText as string | undefined) ??
    null;

  const nextPayload: Record<string, unknown> = {
    ...prev,
    block: prev.block
      ? { ...prev.block, data: { ...(prev.block.data ?? {}), messageText: finalText } }
      : prev.block,
    action: { ...(prev.action ?? {}), messageText: finalText },
  };

  return { nextPayload, originalText };
}
