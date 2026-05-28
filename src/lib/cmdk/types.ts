/**
 * Cmd+K — entry types and the contract between the palette UI and its
 * data sources.
 *
 * M13 Phase 1.B Step 2. Doctrine point 7 — "navigation is direct first,
 * agent-assisted second; tabs are one-click reachable from anywhere" —
 * makes Cmd+K the universal nav primitive. This module defines the
 * shape data sources flatten to so the palette doesn't need to know
 * whether an entry came from `/api/properties/list`, the static route
 * config, the action config, or `/api/agent/conversations`.
 */

/** Kind of entry — drives icon + grouping + click handler routing. */
export type CmdKKind = "property" | "route" | "conversation" | "action";

/**
 * Single palette entry. Pure data — no React, no client-only imports —
 * so the filter can run in unit tests + the API route can construct
 * these on the server. The palette UI is the only consumer that turns
 * these into clickable elements.
 */
export type CmdKEntry = {
  /** Stable id; for properties + conversations this is the row id, for
   * routes + actions a slug ("route:/calendar", "action:new-conversation"). */
  id: string;
  kind: CmdKKind;
  /** Primary display text — what the host sees as the row title. */
  label: string;
  /** Secondary display text (e.g. address for property; preview for
   * conversation). Optional. */
  hint?: string;
  /**
   * Strings the filter searches against. Each entry contributes its
   * own keywords; the filter does case-insensitive substring + token-
   * prefix match against this list. Order matters for tiebreak only —
   * the first keyword is the primary match target.
   *
   * For properties: [name, city, address_line1] (per doctrine —
   * natural references; "tampa" + "jamaica st" both surface Villa
   * Jamaica without needing a nickname column at Phase 1.B).
   *
   * For routes: [label, alt-labels]. For actions: [label, verb
   * synonyms]. For conversations: [preview, propertyName].
   */
  keywords: string[];
  /** Target URL for navigation (router.push). Set for property +
   * route + conversation entries; null for actions whose handler is
   * dispatched in the client. */
  href?: string;
  /** For action entries: a tag the palette caller uses to dispatch a
   * handler. The action set is small enough (3 entries at Phase 1.B)
   * that a switch in the palette is fine. */
  action?: "new-conversation" | "add-property" | "show-today";
};
