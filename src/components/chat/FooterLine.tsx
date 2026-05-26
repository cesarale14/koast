"use client";

/**
 * FooterLine — chat-primary surface footer (M13 Phase 1.A;
 * operator msg 3515 R3 honesty constraint).
 *
 * Renders ONLY real, available numbers — no invented "N layers settled"
 * counter (R3 binding: substrate doesn't yet emit a verifiable layer
 * count, and honesty > polish at this phase). What ships:
 *
 * - "{monthsActive} months" — derived from host signup date when
 *   `monthsActive` is provided; omitted otherwise (no fake placeholder).
 * - "{conversationCount} conversations indexed" — actual count from
 *   the chat store / a future read API; omitted at Phase 1.A if not
 *   yet wired.
 *
 * At Phase 1.A only, both numbers are wired-when-available; the line
 * collapses to empty if neither is. Future phases populate as data
 * shapes land.
 */

export type FooterLineProps = {
  monthsActive?: number | null;
  conversationCount?: number | null;
};

export function FooterLine({
  monthsActive,
  conversationCount,
}: FooterLineProps) {
  const parts: string[] = [];
  if (typeof monthsActive === "number" && monthsActive > 0) {
    parts.push(
      `${monthsActive} ${monthsActive === 1 ? "month" : "months"}`,
    );
  }
  if (typeof conversationCount === "number" && conversationCount > 0) {
    parts.push(
      `${conversationCount} ${conversationCount === 1 ? "conversation" : "conversations"} indexed`,
    );
  }
  if (parts.length === 0) return null;

  return (
    <div
      className="flex items-center justify-center px-4 py-2 text-[11px] flex-shrink-0"
      style={{ color: "var(--tideline)" }}
    >
      <span>{parts.join(" · ")}</span>
    </div>
  );
}
