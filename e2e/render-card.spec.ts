/**
 * Generative-UI AgendaCard — render + reload-persistence (Phase C).
 *
 * Deterministic, no model and no loop-side test code: admin-seed a conversation
 * whose assistant turn carries a typed `render` payload, deep-link to it, assert
 * the AgendaCard renders the structured content, RELOAD, and assert it persists.
 * Proves agent_turns.render → loadTurnsForConversation → <RenderCard> →
 * <AgendaCard>, on both initial load and reload.
 *
 * Also asserts a content field round-trips (a gap sentence the card COMPOSES
 * from structured fields), not just that the component mounts.
 */

import { test, expect } from "@playwright/test";
import {
  adminClient,
  seedConversationWithRender,
  deleteConversationById,
} from "./helpers/supabase-admin";
import { TEST_HOST_1_EMAIL } from "./helpers/fixtures";

const admin = adminClient();
let host1Id = "";

const CONV_ID = "c0000000-0000-4000-8000-00000000ca01";

// A real-shaped AgendaRenderPayload (multi-property, mixed days, structured gaps).
const RENDER = {
  v: 1,
  kind: "agenda",
  horizon: "today_48h",
  today: "2026-05-31",
  groups: {
    today: [
      {
        property: "Villa Jamaica",
        checkIns: [{ guest: null, date: "2026-05-31", numGuests: 3 }],
        checkOuts: [{ guest: "Jeremy", date: "2026-05-31" }, { guest: null, date: "2026-05-31" }],
        turnovers: [],
      },
      {
        property: "Cozy Loft - Tampa",
        checkIns: [],
        checkOuts: [{ guest: null, date: "2026-05-31" }],
        turnovers: [{ date: "2026-05-31", time: null, cleanerAssigned: false }],
      },
    ],
    upcoming: [
      {
        property: "Villa Jamaica",
        checkIns: [],
        checkOuts: [{ guest: null, date: "2026-06-02" }],
        turnovers: [{ date: "2026-06-02", time: "11:30:00", cleanerAssigned: false }],
      },
    ],
  },
  gaps: [
    { kind: "no_cleaner", property: "Cozy Loft - Tampa", date: "2026-05-31" },
    { kind: "no_cleaner", property: "Villa Jamaica", date: "2026-06-02" },
    { kind: "awaiting_reply", property: "Villa Jamaica", guest: "Jeremy" },
    { kind: "missing_essentials", property: "Villa Jamaica" },
  ],
  nullTzPropertyCount: 0,
};

test.beforeAll(async () => {
  for (let page = 1; page <= 10; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const u = data.users.find((x) => x.email === TEST_HOST_1_EMAIL);
    if (u) { host1Id = u.id; break; }
    if (data.users.length < 200) break;
  }
  expect(host1Id).not.toBe("");
  await seedConversationWithRender(admin, {
    id: CONV_ID,
    hostId: host1Id,
    firstMessage: "what's on today?",
    assistantReply: "Two checkouts at Villa Jamaica today including Jeremy, plus one at Cozy Loft.",
    render: RENDER,
  });
});

test.afterAll(async () => {
  await deleteConversationById(admin, CONV_ID);
});

test.describe("Generative-UI AgendaCard", () => {
  test("renders the persisted render payload, and re-renders after reload", async ({ page }) => {
    await page.goto(`/chat/${CONV_ID}`);

    const card = page.getByTestId("render-card");
    await expect(card).toBeVisible();
    // ALL FOUR gaps surface (no silent drop), each composed from structured
    // fields — including BOTH no_cleaners, the later one horizon-labeled.
    await expect(card.getByTestId("agenda-gap")).toHaveCount(4);
    await expect(card).toContainText("Cozy Loft - Tampa: no cleaner for today's turnover");
    await expect(card).toContainText("Villa Jamaica: no cleaner for the Jun 2 turnover");
    await expect(card).toContainText("Jeremy at Villa Jamaica may be awaiting a reply");
    await expect(card).toContainText("Villa Jamaica: missing check-in essentials");

    // RELOAD — must re-render from the column, not a one-time stream.
    await page.reload();
    const card2 = page.getByTestId("render-card");
    await expect(card2).toBeVisible();
    await expect(card2.getByTestId("agenda-gap")).toHaveCount(4);
    await expect(card2).toContainText("Villa Jamaica: no cleaner for the Jun 2 turnover");
  });
});
