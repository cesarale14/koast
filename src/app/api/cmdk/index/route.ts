/**
 * GET /api/cmdk/index — unified Cmd+K data source.
 *
 * Returns the host's properties + recent conversations as a single
 * flat list of CmdKEntry shapes. The palette client merges this with
 * the static route + action catalogs locally (no point round-tripping
 * statics through the wire — they don't change per-host).
 *
 * One round-trip per palette open. Module-scoped client-side cache in
 * the palette hook keeps subsequent re-opens free for ~5 minutes.
 *
 * Auth: session-scoped via supabase.auth.getUser(). host_id derived
 * from session, never from query params (same shape as
 * /api/agent/conversations).
 *
 * Response 200:
 *   { entries: CmdKEntry[] }
 *   — properties first (kind="property"), then top-20 recent
 *     conversations (kind="conversation"). No sort — the filter does
 *     ranking; this endpoint just supplies the universe.
 *
 * Response 401: unauthenticated.
 * Response 500: helper threw.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listConversations } from "@/lib/agent/conversation";
import type { CmdKEntry } from "@/lib/cmdk/types";

const RECENT_CONVERSATIONS_LIMIT = 20;

export async function GET() {
  const auth = createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();

    // Properties — name + city + address_line1 per the doctrine point 2
    // natural-reference contract. The host should be able to find
    // "Villa Jamaica" via "tampa" or "jamaica st" without re-narrowing.
    const { data: propRows, error: propErr } = await supabase
      .from("properties")
      .select("id, name, city, address")
      .eq("user_id", user.id)
      .order("name");
    if (propErr) throw new Error(`property fetch failed: ${propErr.message}`);

    const propertyEntries: CmdKEntry[] = (propRows ?? []).map((p) => {
      const row = p as { id: string; name: string; city: string | null; address: string | null };
      const hintParts = [row.address, row.city].filter(Boolean);
      const keywords = [row.name, row.city ?? "", row.address ?? ""].filter(
        (k): k is string => Boolean(k),
      );
      return {
        id: `property:${row.id}`,
        kind: "property",
        label: row.name,
        hint: hintParts.length > 0 ? hintParts.join(", ") : undefined,
        keywords,
        href: `/properties/${row.id}`,
      };
    });

    // Recent conversations — top-20 from listConversations() output.
    // listConversations returns ordered-by-last_turn_at descending.
    const allConvos = await listConversations(user.id);
    const conversationEntries: CmdKEntry[] = allConvos
      .slice(0, RECENT_CONVERSATIONS_LIMIT)
      .map((c) => {
        const preview = c.preview || "Untitled conversation";
        return {
          id: `conversation:${c.id}`,
          kind: "conversation",
          label: preview,
          hint:
            c.propertyName && c.propertyName !== "All properties"
              ? c.propertyName
              : undefined,
          keywords: [preview, c.propertyName ?? ""].filter(
            (k): k is string => Boolean(k),
          ),
          href: `/chat/${c.id}`,
        };
      });

    return NextResponse.json({
      entries: [...propertyEntries, ...conversationEntries],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "cmdk index failed";
    return NextResponse.json(
      { error: "Cmd+K index failed", detail: message },
      { status: 500 },
    );
  }
}
