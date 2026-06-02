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
    if (found) {
      // Converge the credential: a user left over from an earlier run may
      // carry a different password than the current env value. Reset it (and
      // re-confirm) so seeding is genuinely idempotent and login always works.
      const { error: updErr } = await admin.auth.admin.updateUserById(found.id, {
        password,
        email_confirm: true,
      });
      if (updErr) {
        throw new Error(
          `[e2e] ensureUser: found ${email} but could not reset its password: ${updErr.message}`,
        );
      }
      return found.id;
    }
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

/**
 * Count conversations created by a spec, scoped to its NONCE (same predicate as
 * deleteConversationsByNonce: turn_index=0 content_text contains the nonce). This
 * is the parallel-safe "exactly one conversation" assertion — host-wide
 * countConversations() races concurrent specs that share the host (workers>1 in
 * CI: create-append / delete / render-card all use H1), so a concurrent spec's
 * conversation inflates the host count and the "no duplicate" gate fails on
 * correct behavior. A nonce-scoped count asserts only THIS test's state.
 */
export async function countConversationsByNonce(
  admin: SupabaseClient,
  hostId: string,
  nonce: string,
): Promise<number> {
  const { data: turns } = await admin
    .from("agent_turns")
    .select("conversation_id, content_text")
    .eq("turn_index", 0)
    .ilike("content_text", `%${nonce}%`);
  const ids = Array.from(
    new Set((turns ?? []).map((t) => (t as { conversation_id: string }).conversation_id)),
  );
  if (ids.length === 0) return 0;
  const { count } = await admin
    .from("agent_conversations")
    .select("id", { count: "exact", head: true })
    .eq("host_id", hostId)
    .in("id", ids);
  return count ?? 0;
}

/**
 * Seed a conversation whose assistant turn carries a generative-UI `render`
 * payload (typed JSONB) — for the render-card reload spec. Proves the
 * column → loadTurns → <RenderCard> → reload path deterministically, with NO
 * loop-side test code (the live-stream emission is proven in the agent layer).
 * The assistant turn carries prose too, so it isn't filtered as a stub.
 */
export async function seedConversationWithRender(
  admin: SupabaseClient,
  opts: { id: string; hostId: string; firstMessage: string; assistantReply: string; render: unknown },
): Promise<void> {
  const now = new Date().toISOString();
  const { error: convErr } = await admin.from("agent_conversations").upsert(
    { id: opts.id, host_id: opts.hostId, status: "active", started_at: now, last_turn_at: now },
    { onConflict: "id" },
  );
  if (convErr) throw new Error(`[e2e] seedConversationWithRender ${opts.id}: ${convErr.message}`);
  const { error: turnErr } = await admin.from("agent_turns").upsert(
    [
      { conversation_id: opts.id, turn_index: 0, role: "user", content_text: opts.firstMessage },
      { conversation_id: opts.id, turn_index: 1, role: "assistant", content_text: opts.assistantReply, render: opts.render },
    ],
    { onConflict: "conversation_id,turn_index" },
  );
  if (turnErr) throw new Error(`[e2e] seedConversationWithRender turns ${opts.id}: ${turnErr.message}`);
}

/** Delete a conversation by id (turns cascade). For spec-local cleanup. */
export async function deleteConversationById(admin: SupabaseClient, id: string): Promise<void> {
  await admin.from("agent_conversations").delete().eq("id", id);
}

/** Soft-delete a conversation by id (sets deleted_at) — server-side, for the
 * deleted-deep-link spec (item 17). Idempotent. */
export async function softDeleteConversationById(
  admin: SupabaseClient,
  id: string,
): Promise<void> {
  await admin
    .from("agent_conversations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
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
