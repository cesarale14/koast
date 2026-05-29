/**
 * actions — shared spec helpers. Web-first only; no fixed sleeps in
 * assertions (delays here are deliberate network-timing control via
 * route.continue, NOT assertion waits).
 *
 * M13 Phase 1.B Playwright harness.
 */

import { type Page, type Route, expect } from "@playwright/test";

let nonceCounter = 0;

/** Unique per-test marker embedded in first messages for nonce-scoped cleanup. */
export function makeNonce(label: string): string {
  nonceCounter += 1;
  // No Date.now()/random needed — counter + label + worker index is unique
  // enough within a run; the run is serial locally.
  return `e2e-${label}-${process.pid}-${nonceCounter}`;
}

/** Type a message into the composer and send it via the send button. */
export async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.getByTestId("composer-input");
  await expect(input).toBeEnabled();
  await input.fill(text);
  await page.getByTestId("composer-send").click();
}

/** Wait until a chat turn containing `text` is rendered. */
export async function expectTurnVisible(page: Page, text: string): Promise<void> {
  await expect(
    page.getByTestId("chat-turn").filter({ hasText: text }).first(),
  ).toBeVisible();
}

/** Open the Cmd+K palette via keyboard (Control+K works on Linux/CI chromium). */
export async function openCmdK(page: Page): Promise<void> {
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("cmdk-palette")).toBeVisible();
}

/**
 * Install a pre-request delay on a URL glob, then let the real request
 * proceed (route.continue). Delays the response WITHOUT buffering it —
 * so SSE still streams and a transient UI state (composer disabled,
 * loading skeleton) becomes reliably observable instead of raced.
 */
export async function delayRoute(
  page: Page,
  urlGlob: string,
  ms: number,
): Promise<void> {
  await page.route(urlGlob, async (route: Route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}
