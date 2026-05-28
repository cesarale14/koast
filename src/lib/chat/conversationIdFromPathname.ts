/**
 * conversationIdFromPathname — pure helper extracting the
 * conversation_id segment from a chat-primary pathname.
 *
 * M13 Phase 1.B follow-on (deep-link conversation loading bug fix).
 * The chat-primary surface watches pathname for the active conversation;
 * this is the single source-of-truth extractor so the reducer test and
 * the runtime watcher agree on the matching rules.
 *
 * Matches:
 *   "/"                       → null  (landing / new conversation)
 *   "/chat"                   → null  (canonical chat-primary, no convo)
 *   "/chat/abc-123"           → "abc-123"
 *   "/chat/abc-123/"          → "abc-123"  (trailing slash tolerated)
 *   "/chat/abc-123?foo=bar"   → "abc-123"  (query stripped if present)
 *   "/chat/abc/extra"         → null  (no nested conversation segments)
 *
 * Non-string / empty input → null (defensive — matches isChatPrimary's
 * §3.5.D adversarial-input shape).
 */

const CHAT_CONVERSATION_PATTERN = /^\/chat\/([^/?#]+)\/?$/;

export function conversationIdFromPathname(
  pathname: string | null | undefined,
): string | null {
  if (typeof pathname !== "string" || pathname.length === 0) return null;
  // Strip query + hash before regex match — usePathname() returns the
  // path-only string in Next.js 14+ but defensive-strip catches any
  // future shape change and matches the contract above.
  const stripped = pathname.split(/[?#]/)[0];
  const m = stripped.match(CHAT_CONVERSATION_PATTERN);
  return m ? m[1] : null;
}
