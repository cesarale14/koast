/**
 * supabase-admin — service-role client + seed/cleanup helpers for the
 * E2E harness. RLS-bypassing; ONLY ever pointed at staging (the
 * prod-guard runs before any of these are called).
 *
 * M13 Phase 1.B Playwright harness. All seeding is IDEMPOTENT
 * (upsert-by-id / create-if-missing) per operator amendment A — a
 * staging wipe or migration reset self-heals on the next run.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CONV_A_ID,
  CONV_A_FIRST_MESSAGE,
  CONV_B_ID,
  CONV_B_FIRST_MESSAGE,
  CONV_F_ID,
  CONV_F_FIRST_MESSAGE,
  TEST_HOST_1_EMAIL,
  TEST_HOST_2_EMAIL,
  TEST_PASSWORD,
} from "./fixtures";

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Create the user if missing (email pre-confirmed); return its id. Idempotent. */
export async function ensureUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  // Try create first.
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.data.user) return created.data.user.id;

  // Already exists (or other error) — locate by paging listUsers.
  // Staging is near-empty, so a few pages suffice.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) break;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) break; // last page
  }
  throw new Error(
    `[e2e] ensureUser: could not create or find user ${email}: ${created.error?.message ?? "unknown"}`,
  );
}

/** Upsert a conversation + its two turns by fixed id. Idempotent. */
export async function ensureConversation(
  admin: SupabaseClient,
  opts: {
    id: string;
    hostId: string;
    firstMessage: string;
    assistantReply?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { error: convErr } = await admin
    .from("agent_conversations")
    .upsert(
      {
        id: opts.id,
        host_id: opts.hostId,
        status: "active",
        started_at: now,
        last_turn_at: now,
      },
      { onConflict: "id" },
    );
  if (convErr) {
    throw new Error(`[e2e] ensureConversation ${opts.id}: ${convErr.message}`);
  }

  const turns = [
    {
      conversation_id: opts.id,
      turn_index: 0,
      role: "user",
      content_text: opts.firstMessage,
    },
    {
      conversation_id: opts.id,
      turn_index: 1,
      role: "assistant",
      content_text:
        opts.assistantReply ?? "This is a deterministic Koast test response.",
    },
  ];
  // Upsert by (conversation_id, turn_index) — the unique key.
  const { error: turnErr } = await admin
    .from("agent_turns")
    .upsert(turns, { onConflict: "conversation_id,turn_index" });
  if (turnErr) {
    throw new Error(`[e2e] ensureConversation turns ${opts.id}: ${turnErr.message}`);
  }
}

/** Seed all durable fixtures. Returns the two host ids. Idempotent. */
export async function seedDurableFixtures(
  admin: SupabaseClient,
): Promise<{ host1Id: string; host2Id: string }> {
  const host1Id = await ensureUser(admin, TEST_HOST_1_EMAIL, TEST_PASSWORD);
  const host2Id = await ensureUser(admin, TEST_HOST_2_EMAIL, TEST_PASSWORD);

  await ensureConversation(admin, {
    id: CONV_A_ID,
    hostId: host1Id,
    firstMessage: CONV_A_FIRST_MESSAGE,
  });
  await ensureConversation(admin, {
    id: CONV_B_ID,
    hostId: host1Id,
    firstMessage: CONV_B_FIRST_MESSAGE,
  });
  await ensureConversation(admin, {
    id: CONV_F_ID,
    hostId: host2Id,
    firstMessage: CONV_F_FIRST_MESSAGE,
  });

  return { host1Id, host2Id };
}

/**
 * Delete conversations created by a spec, by nonce. Mutating specs embed
 * a per-test nonce in the first user message; cleanup targets only rows
 * whose turn_index=0 content_text contains the nonce, then deletes those
 * conversations (turns cascade via FK ON DELETE CASCADE).
 */
export async function deleteConversationsByNonce(
  admin: SupabaseClient,
  hostId: string,
  nonce: string,
): Promise<void> {
  const { data: turns } = await admin
    .from("agent_turns")
    .select("conversation_id, content_text")
    .eq("turn_index", 0)
    .ilike("content_text", `%${nonce}%`);
  const ids = Array.from(
    new Set((turns ?? []).map((t) => (t as { conversation_id: string }).conversation_id)),
  );
  if (ids.length === 0) return;
  // Scope the delete to the host to be safe.
  await admin
    .from("agent_conversations")
    .delete()
    .eq("host_id", hostId)
    .in("id", ids);
}

/** Count a host's conversations (for create/dup assertions). */
export async function countConversations(
  admin: SupabaseClient,
  hostId: string,
): Promise<number> {
  const { count } = await admin
    .from("agent_conversations")
    .select("id", { count: "exact", head: true })
    .eq("host_id", hostId);
  return count ?? 0;
}

/** Remove the durable fixtures (global-teardown). */
export async function removeDurableFixtures(
  admin: SupabaseClient,
): Promise<void> {
  await admin
    .from("agent_conversations")
    .delete()
    .in("id", [CONV_A_ID, CONV_B_ID, CONV_F_ID]);
}
