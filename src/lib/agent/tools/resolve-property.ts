/**
 * Shared host-owned property resolver for the propose_* tools. The agent
 * references a property by NAME ("Villa Jamaica"); this resolves it to the
 * owned entity id server-side, preferring an exact case-insensitive match over
 * a unique substring, and refusing ambiguous matches (so the agent asks rather
 * than guessing which property). One implementation, used by propose-ota and
 * propose-pricing-rule — no parallel copies to drift.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any, any, any>;

export type ResolvedProperty = { id: string; name: string } | { error: string };

function ci(s: string): string {
  return s.trim().toLowerCase();
}

/** Resolve a host-owned property by name (exact CI match preferred over substring). */
export async function resolveProperty(
  svc: Svc,
  hostId: string,
  query: string,
): Promise<ResolvedProperty> {
  const { data } = await svc.from("properties").select("id, name").eq("user_id", hostId);
  const rows = (data ?? []) as { id: string; name: string | null }[];
  const q = ci(query);
  const exact = rows.filter((r) => (r.name ?? "").trim().toLowerCase() === q);
  const sub = rows.filter((r) => (r.name ?? "").toLowerCase().includes(q));
  const pick = exact.length === 1 ? exact[0] : exact.length === 0 && sub.length === 1 ? sub[0] : null;
  if (exact.length > 1 || (exact.length === 0 && sub.length > 1)) {
    return { error: `"${query}" matches more than one property — which one?` };
  }
  if (!pick) return { error: `No property matches "${query}".` };
  return { id: pick.id, name: pick.name ?? "Property" };
}
