/**
 * Conversation lifecycle E2E — Create / Append (sweep items 1-7).
 *
 * M13 Phase 1.B Playwright harness. These specs CREATE conversations
 * (canned agent → real persistence) and clean up by nonce. Each spec is
 * independent. Web-first assertions; no fixed sleeps.
 */

import { test, expect } from "@playwright/test";
import {
  adminClient,
  countConversations,
  deleteConversationsByNonce,
} from "./helpers/supabase-admin";
import {
  makeNonce,
  sendMessage,
  expectTurnVisible,
  delayRoute,
  expectComposerSettled,
} from "./helpers/actions";
import { TEST_HOST_1_EMAIL } from "./helpers/fixtures";

const admin = adminClient();
let host1Id = "";

test.beforeAll(async () => {
  // Resolve H1's id once for count/cleanup (seeded by global-setup).
  for (let page = 1; page <= 10; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const u = data.users.find((x) => x.email === TEST_HOST_1_EMAIL);
    if (u) { host1Id = u.id; break; }
    if (data.users.length < 200) break;
  }
  expect(host1Id).not.toBe("");
});

test.describe("Create / Append", () => {
  test("item 1 — new chat + first prompt persists + appears in history, no reload", async ({ page }) => {
    const nonce = makeNonce("item1");
    const before = await countConversations(admin, host1Id);
    await page.goto("/");
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();

    await sendMessage(page, `${nonce} occupancy question`);

    // User turn + canned assistant turn render.
    await expectTurnVisible(page, nonce);
    await expect(page.getByTestId("chat-turn")).toHaveCount(2);

    // Appears in the rail WITHOUT a reload (optimistic prepend).
    await expect(
      page.getByTestId("conversation-item").filter({ hasText: nonce }),
    ).toBeVisible();

    // Persisted (one new conversation).
    await expect.poll(() => countConversations(admin, host1Id)).toBe(before + 1);

    // Let the stream finish (server done persisting) before cleanup, so the
    // delete can't race an in-flight insert.
    await expectComposerSettled(page);
    await deleteConversationsByNonce(admin, host1Id, nonce);
  });

  test("item 2 — several turns from landing → ONE conversation", async ({ page }) => {
    const nonce = makeNonce("item2");
    const before = await countConversations(admin, host1Id);
    await page.goto("/");
    await sendMessage(page, `${nonce} first`);
    await expectTurnVisible(page, "first");
    await sendMessage(page, `${nonce} second`);
    await expectTurnVisible(page, "second");
    await sendMessage(page, `${nonce} third`);
    await expectTurnVisible(page, "third");

    // Exactly one conversation, one rail entry.
    await expect.poll(() => countConversations(admin, host1Id)).toBe(before + 1);
    await expect(
      page.getByTestId("conversation-item").filter({ hasText: nonce }),
    ).toHaveCount(1);

    await expectComposerSettled(page);
    await deleteConversationsByNonce(admin, host1Id, nonce);
  });

  test("item 3 — first message updates URL to /chat/[id]", async ({ page }) => {
    const nonce = makeNonce("item3");
    await page.goto("/");
    await sendMessage(page, `${nonce} url test`);
    await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
    await expectComposerSettled(page);
    await deleteConversationsByNonce(admin, host1Id, nonce);
  });

  test("item 4 — rapid double-send → exactly ONE conversation + composer locks instantly", async ({ page }) => {
    const nonce = makeNonce("item4");
    const before = await countConversations(admin, host1Id);
    // Delay the turn POST so the composer's disabled window is reliably
    // observable (isPending set synchronously at submit → stays disabled
    // for the whole in-flight period).
    await delayRoute(page, "**/api/agent/turn", 1200);

    await page.goto("/");
    const input = page.getByTestId("composer-input");
    await input.fill(`${nonce} double`);
    await page.getByTestId("composer-send").click();

    // Composer locks the instant the first submit fires (X1 fix).
    await expect(input).toBeDisabled();
    // A second send attempt cannot fire (button/input disabled) — try anyway.
    await page.getByTestId("composer-send").click({ force: true }).catch(() => {});

    // After the turn settles, exactly ONE conversation exists.
    await expectTurnVisible(page, nonce);
    await expect.poll(() => countConversations(admin, host1Id)).toBe(before + 1);

    await expectComposerSettled(page);
    await deleteConversationsByNonce(admin, host1Id, nonce);
  });

  test("item 5 — after reload, no duplicate; reconciles by id", async ({ page }) => {
    const nonce = makeNonce("item5");
    const before = await countConversations(admin, host1Id);
    await page.goto("/");
    await sendMessage(page, `${nonce} reload test`);
    await expectTurnVisible(page, nonce);
    await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);

    // Settle the stream before reloading — reloading mid-stream would
    // abandon the client SSE while the server is still finalizing.
    await expectComposerSettled(page);
    await page.reload();

    // Still exactly one in DB + one rail entry (server reconciles optimistic).
    await expect.poll(() => countConversations(admin, host1Id)).toBe(before + 1);
    await expect(
      page.getByTestId("conversation-item").filter({ hasText: nonce }),
    ).toHaveCount(1);

    await deleteConversationsByNonce(admin, host1Id, nonce);
  });

  test("item 6 — second fresh conversation opens clean, no leak", async ({ page }) => {
    const nonce = makeNonce("item6");
    await page.goto("/");
    await sendMessage(page, `${nonce} conv one`);
    await expectTurnVisible(page, nonce);
    await expectComposerSettled(page);

    // Start a fresh conversation by returning to landing.
    await page.goto("/");
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();
    // No turns leaked from the prior conversation.
    await expect(page.getByTestId("chat-turn")).toHaveCount(0);

    await deleteConversationsByNonce(admin, host1Id, nonce);
  });

  test("item 7 — label is first-message-derived + stable across reload (NOT an auto-title)", async ({ page }) => {
    const nonce = makeNonce("item7");
    const label = `${nonce} label-stability`;
    await page.goto("/");
    await sendMessage(page, label);
    await expectTurnVisible(page, nonce);

    const railItem = page.getByTestId("conversation-item").filter({ hasText: nonce });
    await expect(railItem).toContainText(nonce);

    await expectComposerSettled(page);
    await page.reload();
    // Label is still the first message after reload — stable, first-message-
    // derived. (We deliberately do NOT assert an auto-generated title:
    // title-gen is P1-unbuilt; asserting it would be a false failure.)
    await expect(
      page.getByTestId("conversation-item").filter({ hasText: nonce }),
    ).toContainText(nonce);

    await deleteConversationsByNonce(admin, host1Id, nonce);
  });
});
