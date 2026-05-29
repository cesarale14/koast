/**
 * Conversation lifecycle E2E — Error / unhappy (sweep item 14).
 *
 * M13 Phase 1.B Playwright harness. BOTH bad-deep-link sub-cases must
 * resolve the URL↔content desync by redirecting to `/` (S6), never
 * stranding on /chat/[badId] with empty content (the S1 conflation).
 */

import { test, expect } from "@playwright/test";
import { NONEXISTENT_CONV_ID, CONV_F_ID } from "./helpers/fixtures";

test.describe("Error / unhappy deep-links (item 14)", () => {
  test("14a — nonexistent conversation id redirects to /", async ({ page }) => {
    await page.goto(`/chat/${NONEXISTENT_CONV_ID}`);
    // Redirect resolves the desync.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();
    // Never stranded on the bad URL.
    await expect(page).not.toHaveURL(new RegExp(NONEXISTENT_CONV_ID));
  });

  test("14b — foreign-owned conversation (different host) redirects to /", async ({ page }) => {
    // CONV_F is owned by H2; the logged-in host is H1 → loadTurns throws
    // (ownership) → 404 → ChatURLSync redirect. RLS/foreign path, not
    // merely nonexistent.
    await page.goto(`/chat/${CONV_F_ID}`);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(CONV_F_ID));
  });
});
