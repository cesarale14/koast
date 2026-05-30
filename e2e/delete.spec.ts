/**
 * Conversation lifecycle E2E — Delete / soft-delete (sweep items 15-17 + the
 * failed-delete restore cases). M13 D1.
 *
 * D1 is SOFT delete: deleting sets deleted_at; the row is filtered from every
 * read and reappears nowhere — so the "gone after reload" assertions in 15/16
 * prove the SERVER-SIDE filter, not just the optimistic tombstone. Items 17b/17c
 * abort the DELETE request to prove optimistic removal reconciles back on
 * failure (no resurrection-vs-real-failure conflation). Undo is deferred
 * (no item 18) — the failed-delete restore here exercises the same plumbing.
 *
 * Conversations are created via the UI (canned agent) and cleaned by nonce.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  adminClient,
  deleteConversationsByNonce,
  softDeleteConversationById,
} from "./helpers/supabase-admin";
import {
  makeNonce,
  sendMessage,
  expectTurnVisible,
  expectComposerSettled,
} from "./helpers/actions";
import { TEST_HOST_1_EMAIL } from "./helpers/fixtures";

const admin = adminClient();
let host1Id = "";

test.beforeAll(async () => {
  for (let page = 1; page <= 10; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const u = data.users.find((x) => x.email === TEST_HOST_1_EMAIL);
    if (u) { host1Id = u.id; break; }
    if (data.users.length < 200) break;
  }
  expect(host1Id).not.toBe("");
});

/** Create a conversation via the UI; return its id (from the /chat/[id] URL). */
async function createConversation(page: Page, nonce: string, label: string): Promise<string> {
  await sendMessage(page, `${nonce} ${label}`);
  await expectTurnVisible(page, nonce);
  // Web-first: wait for the anchor to land in the URL (don't read page.url()
  // synchronously — the composer can re-read as enabled before the anchor).
  await page.waitForURL(/\/chat\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  // Then ensure the stream fully settled before we delete (avoids racing the
  // server finalize, same discipline as the create specs' cleanup).
  await expectComposerSettled(page);
  const m = page.url().match(/\/chat\/([0-9a-f-]{36})$/);
  expect(m).not.toBeNull();
  return m![1];
}

const rowById = (page: Page, id: string) =>
  page.locator(`[data-testid="conversation-row"][data-conversation-id="${id}"]`);

/** Abort only the DELETE request (leave reads/sends alone) to simulate a
 * server-side delete failure. */
async function abortDeletes(page: Page): Promise<void> {
  await page.route("**/api/agent/conversations/**", (route) => {
    if (route.request().method() === "DELETE") return route.abort();
    return route.continue();
  });
}

test.describe("Delete / soft-delete", () => {
  test("item 15 — delete background conversation: drops from rail, active unchanged, gone after reload", async ({ page }) => {
    const nonce = makeNonce("del15");
    await page.goto("/");
    const idX = await createConversation(page, nonce, "background X");
    await page.goto("/");
    const idY = await createConversation(page, nonce, "active Y");
    expect(idY).not.toBe(idX);

    await expect(rowById(page, idX)).toBeVisible();
    await expect(rowById(page, idY)).toBeVisible();

    await rowById(page, idX).hover();
    await rowById(page, idX).getByTestId("conversation-delete").click();

    // Background X drops immediately; active Y is untouched.
    await expect(rowById(page, idX)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/chat/${idY}$`));
    await expectTurnVisible(page, "active Y");

    // Gone after reload — proves the SERVER filter (not just the tombstone).
    await page.reload();
    await expect(rowById(page, idX)).toHaveCount(0);
    await expect(rowById(page, idY)).toBeVisible();

    await deleteConversationsByNonce(admin, host1Id, nonce);
  });

  test("item 16 — delete active conversation: explicit redirect to / (S1), gone after reload", async ({ page }) => {
    const nonce = makeNonce("del16");
    await page.goto("/");
    const idX = await createConversation(page, nonce, "active to delete");
    await expect(page).toHaveURL(new RegExp(`/chat/${idX}$`));

    await rowById(page, idX).hover();
    await rowById(page, idX).getByTestId("conversation-delete").click();

    // Active delete → explicit router.replace("/") to S1.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();
    await expect(rowById(page, idX)).toHaveCount(0);

    // Gone after reload — proves the SERVER filter.
    await page.reload();
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();
    await expect(rowById(page, idX)).toHaveCount(0);

    await deleteConversationsByNonce(admin, host1Id, nonce);
  });

  test("item 17 — navigate to a deleted conversation URL redirects to / (N4/S6)", async ({ page }) => {
    const nonce = makeNonce("del17");
    await page.goto("/");
    const idX = await createConversation(page, nonce, "deleted server-side");

    // Soft-delete server-side directly (deterministic), then deep-link to it.
    await softDeleteConversationById(admin, idX);
    await page.goto(`/chat/${idX}`);

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(idX));

    await deleteConversationsByNonce(admin, host1Id, nonce);
  });

  test("item 17b — optimistic remove then FAILED delete restores the row (background)", async ({ page }) => {
    const nonce = makeNonce("del17b");
    await page.goto("/");
    const idX = await createConversation(page, nonce, "background restore");
    await page.goto("/");
    const idY = await createConversation(page, nonce, "active keep");

    await abortDeletes(page);
    await rowById(page, idX).hover();
    await rowById(page, idX).getByTestId("conversation-delete").click();

    // The DELETE failed → the optimistic removal reconciles back.
    await expect(rowById(page, idX)).toBeVisible();
    // Active conversation untouched throughout.
    await expect(page).toHaveURL(new RegExp(`/chat/${idY}$`));

    await page.unroute("**/api/agent/conversations/**");
    await deleteConversationsByNonce(admin, host1Id, nonce);
  });

  test("item 17c — delete ACTIVE then FAILED delete: at S1 AND row restored", async ({ page }) => {
    const nonce = makeNonce("del17c");
    await page.goto("/");
    const idX = await createConversation(page, nonce, "active fail restore");
    await expect(page).toHaveURL(new RegExp(`/chat/${idX}$`));

    await abortDeletes(page);
    await rowById(page, idX).hover();
    await rowById(page, idX).getByTestId("conversation-delete").click();

    // Active-delete navigated to S1 optimistically...
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();
    // ...and the failed DELETE restored the row to the rail (recoverable).
    await expect(rowById(page, idX)).toBeVisible();

    await page.unroute("**/api/agent/conversations/**");
    await deleteConversationsByNonce(admin, host1Id, nonce);
  });

  test("item 18 — delete → undo → restored AND present after reload", async ({ page }) => {
    const nonce = makeNonce("del18");
    await page.goto("/");
    const idX = await createConversation(page, nonce, "undo me");
    // Background it so delete doesn't navigate (active-undo navigation is
    // intentionally not built — restoring to the rail is enough).
    await page.goto("/");
    await createConversation(page, nonce, "active other");

    await rowById(page, idX).hover();
    await rowById(page, idX).getByTestId("conversation-delete").click();
    await expect(rowById(page, idX)).toHaveCount(0);

    // The success toast carries the Undo action. Click it and wait for the
    // restore POST to land server-side before reloading.
    const restored = page.waitForResponse(
      (r) => r.url().includes(`/conversations/${idX}/restore`) && r.request().method() === "POST",
    );
    await page.getByTestId("toast-action").click();
    await restored;

    // Optimistic restore puts it back immediately...
    await expect(rowById(page, idX)).toBeVisible();
    // ...and after reload it's STILL there — proves the endpoint nulled
    // deleted_at server-side, not just the optimistic un-tombstone.
    await page.reload();
    await expect(rowById(page, idX)).toBeVisible();

    await deleteConversationsByNonce(admin, host1Id, nonce);
  });
});
