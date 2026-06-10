/**
 * pageContext — derive the agent's page-context hints from the URL.
 *
 * P2.1 (command strip): each message sent from the docked companion carries
 * { active_route, active_property_id?, active_date_range? } so "block this
 * weekend" / "raise the rate here" resolve against what the host is LOOKING
 * AT, not a stale chat-dropdown selection. The URL is the source of truth for
 * "what the host is looking at", so we read it rather than threading page
 * state through props.
 *
 * Pure + framework-free (takes pathname + a `.get()` params object) so it is
 * unit-testable without React. The hook wrapper lives in `usePageContext.ts`.
 *
 * SECURITY: a derived active_property_id is only a HINT. The agent loop
 * re-resolves it through resolveActiveProperty (host-ownership check) before
 * any context is injected — a spoofed/foreign id is logged and dropped. So
 * permissive extraction here is safe; the server is the gate.
 */

export type PageContext = {
  active_route: string;
  active_property_id?: string;
  active_date_range?: { start: string; end: string };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ParamsLike = { get(name: string): string | null };

/**
 * Build the page-context hint object from a route + query params.
 * - active_route: always the pathname.
 * - active_property_id: from a `/properties/{uuid}` path, else a
 *   `?property` / `?propertyId` / `?property_id` query param — only when it
 *   is a well-formed UUID.
 * - active_date_range: from `?start` + `?end` YYYY-MM-DD query params (the
 *   calendar's visible-window URL state), only when both are valid ISO dates
 *   and start <= end.
 */
export function derivePageContext(pathname: string, params: ParamsLike): PageContext {
  const ctx: PageContext = { active_route: pathname || "/" };

  const pathMatch = pathname.match(/^\/properties\/([0-9a-f-]{36})(?:\/|$)/i);
  const queryProp =
    params.get("property") ?? params.get("propertyId") ?? params.get("property_id");
  const propId =
    (pathMatch && UUID_RE.test(pathMatch[1]) ? pathMatch[1] : null) ??
    (queryProp && UUID_RE.test(queryProp) ? queryProp : null);
  if (propId) ctx.active_property_id = propId;

  const start = params.get("start");
  const end = params.get("end");
  if (
    start &&
    end &&
    ISO_DATE_RE.test(start) &&
    ISO_DATE_RE.test(end) &&
    start <= end
  ) {
    ctx.active_date_range = { start, end };
  }

  return ctx;
}
