/**
 * carding-eval — the sharpened when-to-card rule: the card means "your state
 * needs your eyes," earned by an ACTIVE day OR an ATTENTION ITEM (gap) in the
 * window. Four cases + a narrow-query guard:
 *
 *   (a) today activity            → OBSERVED (not gated)  the content-first rule cards active
 *       days best-effort; a clean LIGHT day legitimately reads as prose, and we
 *       don't pay determinism to force it (no active-day flag, no prose-suppressor).
 *   (b-gappy) empty today + gap   → card   (the gap-gated preamble flag — the ONLY must-card guarantee)
 *   (b-clean) empty today, NO gap → PROSE  (flag's negative bound — clean upcoming stays prose)
 *   boundary: empty window        → PROSE  (nothing to scan)
 *   narrow-on-gappy               → PROSE  (flag is overview-gated; must not force-card a narrow ask)
 *
 * Gated: (b-gappy) wants a high floor (>=70% binomial bar); the prose-cases are
 * STRICT 0. (a) is reported only. Run: `npx tsx eval/carding-eval.ts`.
 */
import { loadEvalEnv } from "./lib/load-env";

async function main() {
  loadEvalEnv();
  const NC = parseInt(process.env.CARD_N ?? "20", 10); // card cases
  const NP = parseInt(process.env.PROSE_N ?? "10", 10); // prose / strict-0 cases
  const { runPromptThroughLoop } = await import("./lib/chat-eval");
  const { adminClient, seedAgendaFixtures, seedNoGapFixture, seedEmptyTodayGappyFixture, seedEmptyTodayCleanFixture, cleanupEvalConversations } =
    await import("./agenda-fixtures");
  const admin = adminClient();
  const { emptyHostId, erwinHostId } = await seedAgendaFixtures(admin);
  const noGapHost = await seedNoGapFixture(admin);
  const emptyGapHost = await seedEmptyTodayGappyFixture(admin);
  const emptyCleanHost = await seedEmptyTodayCleanFixture(admin);
  const isAgenda = (p: unknown) => !!p && typeof p === "object" && (p as { kind?: unknown }).kind === "agenda";
  const OVERVIEW = "What's on today?";

  const sweep = async (host: string, label: string, prompt: string, n: number, expectCard: boolean): Promise<number> => {
    let carded = 0;
    for (let i = 0; i < n; i++) {
      const r = await runPromptThroughLoop(host, prompt);
      const did = isAgenda(r.renderPayload);
      if (did) carded++;
      if (did !== expectCard) {
        console.log(`  [${label}] #${i + 1} ${did ? "CARDED" : "no-card"} (want ${expectCard ? "card" : "prose"}) :: ${r.text.replace(/\s+/g, " ").slice(0, 120)}`);
      }
    }
    return carded;
  };

  const a = await sweep(noGapHost, "a today-activity", OVERVIEW, NC, true);
  const bg = await sweep(emptyGapHost, "b-gappy empty+gap", OVERVIEW, NC, true);
  const bc = await sweep(emptyCleanHost, "b-clean empty+clean", OVERVIEW, NP, false);
  const z = await sweep(emptyHostId, "boundary empty-window", OVERVIEW, NP, false);
  const narrow = await sweep(emptyGapHost, "narrow-on-gappy", "When does Owen check out?", NP, false);
  // The flag now fires on ANY gappy host with activity, incl. an ACTIVE gappy
  // host (erwin) — so overview-gating is under more pressure. A narrow ask on
  // erwin must NOT force-card.
  const narrowActive = await sweep(erwinHostId, "narrow-on-active-gappy", "When does Mike check out?", NP, false);

  await cleanupEvalConversations(admin, noGapHost);
  await cleanupEvalConversations(admin, emptyGapHost);
  await cleanupEvalConversations(admin, emptyCleanHost);
  await cleanupEvalConversations(admin, emptyHostId);
  await cleanupEvalConversations(admin, erwinHostId);

  const floor = Math.ceil(NC * 0.7);
  // (a) is OBSERVED, not gated — a clean light active day cards best-effort.
  const pass = bg >= floor && bc === 0 && z === 0 && narrow === 0 && narrowActive === 0;
  console.log(`\n[carding-cases] ${pass ? "PASS" : "FAIL"}`);
  console.log(`  (a) today activity        cards ${a}/${NC}   [OBSERVED, not gated — best-effort]`);
  console.log(`  (b-gappy) empty + gap     cards ${bg}/${NC}   (floor ${floor}) ← must-card guarantee`);
  console.log(`  (b-clean) empty + clean   cards ${bc}/${NP}   (STRICT 0)`);
  console.log(`  boundary empty-window     cards ${z}/${NP}   (STRICT 0)`);
  console.log(`  narrow-on-gappy           cards ${narrow}/${NP}   (STRICT 0)`);
  console.log(`  narrow-on-active-gappy    cards ${narrowActive}/${NP}   (STRICT 0)`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
