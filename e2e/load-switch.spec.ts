/**
 * Conversation lifecycle E2E — Load / Switch (sweep items 8-13).
 *
 * M13 Phase 1.B Playwright harness. These ride the durable seeded
 * fixtures (CONV_A, CONV_B owned by H1) — read-only, no cleanup needed.
 * Web-first assertions; item 9 controls timing via delayRoute to make
 * the loading skeleton observable (assert distinct states, never race
 * the flash).
 */

import { test, expect } from "@playwright/test";
import { openCmdK, expectTurnVisible, delayRoute } from "./helpers/actions";
import {
  CONV_A_ID,
  CONV_B_ID,
  CONV_A_FIRST_MESSAGE,
  CONV_B_FIRST_MESSAGE,
} from "./helpers/fixtures";

test.describe("Load / Switch", () => {
  test("item 8 — Cmd+K recent → conversation loads", async ({ page }) => {
    await page.goto("/");
    await openCmdK(page);
    await page.getByTestId("cmdk-palette").getByRole("textbox").fill("occupancy");
    // Target conversation A's row precisely by its cmdk id — "occupancy" is
    // also a Market Intel keyword, so a loose hasText match would grab the
    // route row instead. Scoping to the conversation entry keeps the spec
    // honest (it must be the seeded conversation that loads, not a tab).
    const result = page.locator(
      `[data-testid="cmdk-result"][data-cmdk-id="conversation:${CONV_A_ID}"]`,
    );
    await expect(result).toBeVisible();
    await result.click();

    await expect(page).toHaveURL(new RegExp(`/chat/${CONV_A_ID}$`));
    await expectTurnVisible(page, CONV_A_FIRST_MESSAGE);
  });

  test("item 9 — switch A→B shows loading skeleton, never the landing flash", async ({ page }) => {
    // Delay the turns fetch so the loading state is reliably observable.
    await delayRoute(page, "**/api/agent/conversations/*/turns", 1200);

    await page.goto(`/chat/${CONV_A_ID}`);
    await expectTurnVisible(page, CONV_A_FIRST_MESSAGE);

    // Soft-switch to B via the rail.
    await page
      .getByTestId("conversation-item")
      .filter({ hasText: /Fixture B|pricing/i })
      .first()
      .click();

    // POSITIVE assertion: skeleton visible during the switch AND the
    // landing/empty state is NOT shown (the anti-flash guarantee).
    await expect(page.getByTestId("conversation-loading")).toBeVisible();
    await expect(page.getByTestId("chat-empty-state")).toHaveCount(0);

    // Then B's content arrives.
    await expectTurnVisible(page, CONV_B_FIRST_MESSAGE);
  });

  test("item 10 — /chat/[A] → /chat/[B] switches correctly", async ({ page }) => {
    await page.goto(`/chat/${CONV_A_ID}`);
    await expectTurnVisible(page, CONV_A_FIRST_MESSAGE);

    await page
      .getByTestId("conversation-item")
      .filter({ hasText: /Fixture B|pricing/i })
      .first()
      .click();

    await expect(page).toHaveURL(new RegExp(`/chat/${CONV_B_ID}$`));
    await expectTurnVisible(page, CONV_B_FIRST_MESSAGE);
    // A's content is gone.
    await expect(
      page.getByTestId("chat-turn").filter({ hasText: CONV_A_FIRST_MESSAGE }),
    ).toHaveCount(0);
  });

  test("item 11 — /chat/[id] → / (back) returns to landing", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();
    await page.goto(`/chat/${CONV_A_ID}`);
    await expectTurnVisible(page, CONV_A_FIRST_MESSAGE);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  });

  test("item 12 — browser back/forward → correct conversation each time", async ({ page }) => {
    await page.goto(`/chat/${CONV_A_ID}`);
    await expectTurnVisible(page, CONV_A_FIRST_MESSAGE);
    await page.goto(`/chat/${CONV_B_ID}`);
    await expectTurnVisible(page, CONV_B_FIRST_MESSAGE);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/chat/${CONV_A_ID}$`));
    await expectTurnVisible(page, CONV_A_FIRST_MESSAGE);

    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/chat/${CONV_B_ID}$`));
    await expectTurnVisible(page, CONV_B_FIRST_MESSAGE);
  });

  test("item 13 — reload mid-conversation stays coherent, no duplicate", async ({ page }) => {
    await page.goto(`/chat/${CONV_A_ID}`);
    await expectTurnVisible(page, CONV_A_FIRST_MESSAGE);
    const before = await page.getByTestId("chat-turn").count();

    await page.reload();

    await expectTurnVisible(page, CONV_A_FIRST_MESSAGE);
    await expect(page.getByTestId("chat-turn")).toHaveCount(before);
    // A appears once in the rail.
    await expect(
      page.getByTestId("conversation-item").filter({ hasText: /Fixture A|occupancy/i }),
    ).toHaveCount(1);
  });
});
