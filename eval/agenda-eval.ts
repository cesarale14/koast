/**
 * agenda-eval — the chat-quality eval for operational-state grounding.
 * Eval-first: RED before the rollup (agent deflects), GREEN after.
 *
 * Run:  npx tsx eval/agenda-eval.ts
 *
 * Sends an 8-prompt set through the REAL loop (real model, staging fixtures),
 * applies deterministic hard assertions (no visibility-deflection, no UUID
 * leak, grounded-in real seeded items, drill-down calls read_guest_thread),
 * and REPORTS the existing output judges' verdicts on chat output (the signal
 * for whether the prompt-nudge suffices or the loop needs the judges wired in).
 *
 * Exit code: 0 if all hard assertions pass (GREEN), 1 otherwise (RED).
 */

import { loadEvalEnv } from "./lib/load-env";

interface PromptSpec {
  id: string;
  host: "erwin" | "empty" | "nameless" | "split";
  prompt: string;
  grounding?: string[]; // ALL must appear (real seeded items)
  groundingAny?: string[]; // at least ONE must appear
  mustCallTool?: string;
  emptyAck?: boolean; // must acknowledge an empty agenda (not deflect)
  // Answer reproduces verbatim quoted/forwarded guest content (e.g. a thread).
  // The surface-form judges (emoji/exclamation) false-positive on the guest's
  // own punctuation; skip them so the rig self-reports a clean verdict.
  quotedContent?: boolean;
  // NONE of these substrings may appear (case-insensitive). Used for the
  // no-name case (never "a guest") and the today-only case (never a
  // manufactured "tomorrow" / "next two days" line).
  forbid?: string[];
  // At least ONE must appear (case-insensitive) — e.g. an action word for a
  // nameless booking ("checkout"), so the answer carries property + action.
  mentionAny?: string[];
  // A regex (source string, matched case-insensitive) that must NOT match —
  // used for the checkout-split case to catch the window total stated as
  // today's count ("four checkouts today" / folding the later-day item in).
  forbidRegex?: string;
}

const PROMPTS: PromptSpec[] = [
  { id: "prioritize-today", host: "erwin", prompt: "What should I prioritize today?", grounding: ["Erwin", "Sara"] },
  // "Anything I'm missing" is a GAP question (per the hardened anti-deflection
  // rule): a good answer centers on the agenda's gap signals — the unstaffed
  // turnover, Erwin awaiting a reply, the missing parking essential — and need
  // NOT re-list the no-gap roster (Sara). Assert it engages a gap, not deflects.
  { id: "anything-missing", host: "erwin", prompt: "Anything I'm missing today?", groundingAny: ["cleaner", "turnover", "waiting", "parking", "reply", "Erwin"] },
  { id: "this-week", host: "erwin", prompt: "What's happening this week?", groundingAny: ["Erwin", "Sara", "Mike"] },
  { id: "guests-waiting", host: "erwin", prompt: "Any guests waiting on me?", grounding: ["Erwin"] },
  // Grounded answer names the checkout's guest OR property (a deflecting one
  // names neither). Requiring the exact guest name was brittle — the agent
  // sometimes leads with the property + turnover detail.
  { id: "checkout-tomorrow", host: "erwin", prompt: "What's checking out tomorrow?", groundingAny: ["Mike", "Villa Erwin"] },
  { id: "tampa-weekend", host: "erwin", prompt: "Is the Tampa place busy this weekend?", groundingAny: ["Erwin", "Sara", "Mike", "Villa Erwin", "Bayside"] },
  { id: "empty-host", host: "empty", prompt: "What should I prioritize today?", emptyAck: true },
  // Composition: the agenda preview is one line, so this must reach into the
  // full thread — agent resolves "Erwin" → internal booking_id → read_guest_thread.
  { id: "drilldown-erwin", host: "erwin", prompt: "Pull up my full message thread with Erwin — show me everything he's sent.", grounding: ["Erwin"], mustCallTool: "read_guest_thread", quotedContent: true },
  // (i) Nameless iCal booking: the answer names the property + an action and
  // does NOT invent a name or fall back to "a guest" / the OTA placeholder.
  { id: "nameless-ical", host: "nameless", prompt: "What's checking out today?", grounding: ["Seaside"], mentionAny: ["checkout", "check-out", "checking out", "check out"], forbid: ["a guest", "airbnb guest"] },
  // (ii) Today has items, tomorrow is empty: state today's count cleanly; never
  // manufacture a "tomorrow" line or lump it as "over the next two days".
  { id: "today-only-split", host: "nameless", prompt: "What should I prioritize today?", grounding: ["Seaside"], forbid: ["tomorrow", "next two days", "over the next two"] },
  // Checkout split (prod shape): MULTI-property + mixed days under one window
  // "Check-outs (4)" header. A (Harbor) has 2 today + 1 on today+2; B (Dockside)
  // has 1 today. The answer must name both properties + Jeremy, state A's
  // today-count as 2 (not 3), and NOT fold the today+2 item into today —
  // i.e. never "three checkouts at Harbor ... today".
  { id: "checkout-split-multi", host: "split", prompt: "What's on for today?", grounding: ["Jeremy", "Harbor", "Dockside"], mentionAny: ["two", "2 "], forbidRegex: "(?:three|3)\\b[^.?!]{0,25}harbor[^.?!]{0,20}today|harbor[^.?!]{0,20}(?:three|3)\\b[^.?!]{0,20}check|today[^.?!]{0,25}(?:three|3)\\b[^.?!]{0,25}harbor" },
];

const EMPTY_ACK =
  /\b(nothing|no (?:check-?ins?|checkouts?|bookings?|guests?|turnovers?|messages?)|all (?:caught up|clear|quiet)|next 48|quiet (?:day|stretch)|clear (?:calendar|schedule)|don'?t see any|free and clear|all set)\b/i;

async function main() {
  loadEvalEnv();
  const mode = (process.env.EVAL_MODE ?? "").toUpperCase() || "RUN";

  const {
    runPromptThroughLoop,
    runChatJudges,
    deflectsVisibility,
    leaksUuid,
    rawMarkdown,
    groundedIn,
    looksLikeGenericChecklist,
    judgeVerdicts,
  } = await import("./lib/chat-eval");
  const {
    adminClient,
    seedAgendaFixtures,
    seedBoundaryFixture,
    seedNamelessFixture,
    seedSplitFixture,
    cleanupEvalConversations,
    BOUNDARY_NOW_ISO,
    BOUNDARY_LOCAL_TODAY,
    BOUNDARY_UTC_TODAY,
  } = await import("./agenda-fixtures");
  const { buildAgendaRollup, agendaPreamble } = await import("@/lib/agent/agenda");

  const admin = adminClient();
  console.log("seeding agenda fixtures (staging)…");
  const { erwinHostId, emptyHostId } = await seedAgendaFixtures(admin);
  const namelessHostId = await seedNamelessFixture(admin);
  const splitHostId = await seedSplitFixture(admin);
  const hostId = (h: PromptSpec["host"]) =>
    h === "erwin" ? erwinHostId
    : h === "nameless" ? namelessHostId
    : h === "split" ? splitHostId
    : emptyHostId;

  console.log(`\n=== AGENDA EVAL${mode !== "RUN" ? ` (${mode})` : ""} — ${PROMPTS.length} prompts ===\n`);

  let hardPass = 0;
  const judgeFailTally: Record<string, number> = {};

  for (const spec of PROMPTS) {
    const run = await runPromptThroughLoop(hostId(spec.host), spec.prompt);
    const text = run.text;
    // Grounding checks the FULL host-facing surface — prose AND the rendered
    // card. When an overview cards, the prose is a brief summary (the "summary,
    // not card-dump" rule) and the named items live in the card; the host sees
    // both. Forbid / mentionAny / deflection / markdown stay on the prose only.
    const surface = run.renderPayload ? `${text} ${JSON.stringify(run.renderPayload)}` : text;

    const failures: string[] = [];
    if (run.error) failures.push(`loop-error: ${run.error}`);
    if (!text) failures.push("empty-output");
    if (deflectsVisibility(text)) failures.push("VISIBILITY-DEFLECTION");
    if (leaksUuid(text)) failures.push("UUID-LEAK");
    const md = rawMarkdown(text);
    if (md.length) failures.push(`RAW-MARKDOWN[${md.join(",")}]`);
    if (spec.grounding) {
      const g = groundedIn(surface, spec.grounding);
      if (!g.ok) failures.push(`grounding-missing[${g.missing.join(",")}]`);
    }
    if (spec.groundingAny) {
      const hit = spec.groundingAny.some((t) => surface.toLowerCase().includes(t.toLowerCase()));
      if (!hit) failures.push(`grounding-any-missing[${spec.groundingAny.join("|")}]`);
    }
    if (spec.mustCallTool && !run.toolCalls.includes(spec.mustCallTool)) {
      failures.push(`tool-not-called[${spec.mustCallTool}]`);
    }
    if (spec.emptyAck && !EMPTY_ACK.test(text)) failures.push("no-empty-acknowledgment");
    if (spec.forbid) {
      const hit = spec.forbid.filter((p) => text.toLowerCase().includes(p.toLowerCase()));
      if (hit.length) failures.push(`forbidden-phrase[${hit.join(",")}]`);
    }
    if (spec.mentionAny) {
      const ok = spec.mentionAny.some((p) => text.toLowerCase().includes(p.toLowerCase()));
      if (!ok) failures.push(`mention-any-missing[${spec.mentionAny.join("|")}]`);
    }
    if (spec.forbidRegex && new RegExp(spec.forbidRegex, "i").test(text)) {
      failures.push(`forbid-regex-matched[${spec.forbidRegex}]`);
    }

    // Judges (reported signal, not a hard gate). Surface-form judges are
    // skipped on quoted-content prompts (the guest's punctuation isn't the
    // agent's voice) so the rig self-reports without a human re-recognizing it.
    const verdicts = judgeVerdicts(await runChatJudges(text, spec.quotedContent === true));
    for (const [jid, v] of Object.entries(verdicts)) {
      if (v === "fail") judgeFailTally[jid] = (judgeFailTally[jid] ?? 0) + 1;
    }

    const pass = failures.length === 0;
    if (pass) hardPass++;
    const snippet = text.replace(/\s+/g, " ").slice(0, 220);
    console.log(`[${spec.id}] (${spec.host})  ${pass ? "PASS" : "FAIL"}`);
    if (!pass) console.log(`   hard-fails: ${failures.join(" | ")}`);
    console.log(`   tools: [${run.toolCalls.join(", ")}]  checklist-shape: ${looksLikeGenericChecklist(text)}`);
    console.log(`   judges: ${Object.entries(verdicts).map(([k, v]) => `${k}=${v}`).join(" ") || "(none)"}`);
    console.log(`   out: "${snippet}"\n`);
  }

  // DAY-BOUNDARY (deterministic, no LLM): inject now = 00:30 UTC + an EDT
  // property; the window must resolve to the property-LOCAL date, not the UTC
  // date. Catches the tz bug that mislabeled an 8:30pm EDT moment as the next day.
  const boundaryHostId = await seedBoundaryFixture(admin);
  const bRollup = await buildAgendaRollup(admin, boundaryHostId, new Date(BOUNDARY_NOW_ISO));
  const bFailures: string[] = [];
  if (bRollup.today !== BOUNDARY_LOCAL_TODAY) {
    bFailures.push(`window-today=${bRollup.today} (expected EDT-local ${BOUNDARY_LOCAL_TODAY}, not UTC ${BOUNDARY_UTC_TODAY})`);
  }
  if (!bRollup.checkIns.some((c) => c.date === BOUNDARY_LOCAL_TODAY)) {
    bFailures.push("EDT-today check-in missing (UTC windowing would drop it)");
  }
  const bPass = bFailures.length === 0;
  if (bPass) hardPass++;
  console.log(`[day-boundary] (deterministic)  ${bPass ? "PASS" : "FAIL"}`);
  if (!bPass) console.log(`   hard-fails: ${bFailures.join(" | ")}`);
  console.log(`   rollup.today=${bRollup.today}  EDT-today check-ins=[${bRollup.checkIns.filter((c) => c.date === BOUNDARY_LOCAL_TODAY).map((c) => c.guest).join(",")}]\n`);

  // NAMELESS / NO-NAME (deterministic, no LLM): an OTA-placeholder booking
  // ("Airbnb Guest", null first_name) must render BY PROPERTY + ACTION — its
  // rollup guest is null and the preamble says "a checkout at <property>",
  // never the placeholder token as a name ("Airbnb …") or "a guest".
  const nRollup = await buildAgendaRollup(admin, namelessHostId, new Date());
  const nPre = agendaPreamble(nRollup);
  const nFailures: string[] = [];
  if (nRollup.checkOuts.some((c) => c.guest !== null)) {
    nFailures.push(`nameless checkout guest should be null (got [${nRollup.checkOuts.map((c) => String(c.guest)).join(", ")}])`);
  }
  if (/\bairbnb\b/i.test(nPre)) nFailures.push("placeholder 'Airbnb' leaked into the preamble as a name");
  if (/\ba guest\b/i.test(nPre)) nFailures.push("'a guest' phrasing in the preamble (want property + action)");
  if (!/Seaside Cottage: \d+ check-?out/i.test(nPre)) nFailures.push("nameless checkouts not on a per-property 'Seaside Cottage: N check-outs' line");
  const nPass = nFailures.length === 0;
  if (nPass) hardPass++;
  console.log(`[nameless-preamble] (deterministic)  ${nPass ? "PASS" : "FAIL"}`);
  if (!nPass) console.log(`   hard-fails: ${nFailures.join(" | ")}`);
  console.log(`   today fragment: "${(nPre.match(/Seaside Cottage:[^\n]*/)?.[0] ?? "(none)").slice(0, 200)}"\n`);

  // SPLIT PREAMBLE STRUCTURE (deterministic, no LLM): the multi-property split
  // (A: 2 today + 1 on today+2; B: 1 today) must pre-bucket into a TODAY group
  // with Check-outs (3) and an UPCOMING group with Check-outs (1) — so the model
  // reads today's set rather than re-tallying across properties.
  const sRollup = await buildAgendaRollup(admin, splitHostId, new Date());
  const sPre = agendaPreamble(sRollup);
  const [sTodaySection, sUpSection = ""] = sPre.split(/\nUPCOMING/i);
  const sFailures: string[] = [];
  const coToday = sRollup.checkOuts.filter((c) => c.date === sRollup.today).length;
  const coUpcoming = sRollup.checkOuts.filter((c) => c.date !== sRollup.today).length;
  if (coToday !== 3) sFailures.push(`rollup today check-outs=${coToday} (expected 3)`);
  if (coUpcoming !== 1) sFailures.push(`rollup upcoming check-outs=${coUpcoming} (expected 1)`);
  if (!/\nTODAY \(/.test(sPre)) sFailures.push("no TODAY group header");
  if (!/\nUPCOMING \(/i.test(sPre)) sFailures.push("no UPCOMING group header");
  // TODAY must carry per-property counts: A=2 check-outs, B=1 check-out.
  if (!/Harbor House: 2 check-outs/.test(sTodaySection)) sFailures.push("TODAY: Harbor House not '2 check-outs' (per-property today count)");
  if (!/Dockside Flat: 1 check-out\b/.test(sTodaySection)) sFailures.push("TODAY: Dockside Flat not '1 check-out'");
  // The later-day Harbor checkout must be UPCOMING (1), never in TODAY.
  if (!/Harbor House: 1 check-out\b/.test(sUpSection)) sFailures.push("UPCOMING: Harbor House later checkout not '1 check-out'");
  if (/Harbor House: 3 check-outs/.test(sTodaySection)) sFailures.push("TODAY folds the later-day item into Harbor (3 check-outs)");
  const sPass = sFailures.length === 0;
  if (sPass) hardPass++;
  console.log(`[split-preamble] (deterministic)  ${sPass ? "PASS" : "FAIL"}`);
  if (!sPass) console.log(`   hard-fails: ${sFailures.join(" | ")}`);
  console.log(`   TODAY fragment: "${(sTodaySection.match(/(Harbor House|Dockside Flat):[^\n]*/g)?.join(" || ") ?? "(none)").slice(0, 220)}"`);
  console.log(`   UPCOMING fragment: "${(sUpSection.match(/(Harbor House|Dockside Flat):[^\n]*/)?.[0] ?? "(none)").slice(0, 160)}"\n`);

  // ANTI-DEFLECTION SWEEP (multi-run): the visibility-deflection failure is
  // INTERMITTENT, so a once-per-run assertion is a weak net for it. Run the
  // gap-asking prompts N times each against the erwin host (which has a real
  // "Property gaps" line + an unstaffed turnover) and require ALL to ground.
  // N is sized to the historical intermittency (~7%), not to 1 — at N=10/prompt
  // a single reintroduced flake has a real chance of tripping. Override with
  // DEFLECT_N (e.g. a deeper validation pass at N=30).
  const DEFLECT_N = parseInt(process.env.DEFLECT_N ?? "10", 10);
  const DEFLECT_PROMPTS = ["Anything I'm missing today?", "What am I forgetting today?"];
  let deflectFails = 0;
  const deflectRuns = DEFLECT_PROMPTS.length * DEFLECT_N;
  for (const dp of DEFLECT_PROMPTS) {
    for (let i = 0; i < DEFLECT_N; i++) {
      const run = await runPromptThroughLoop(erwinHostId, dp);
      if (run.error || !run.text || deflectsVisibility(run.text)) {
        deflectFails++;
        console.log(`   [deflect] FAIL "${dp}" #${i + 1}: ${(run.error ?? run.text).replace(/\s+/g, " ").slice(0, 200)}`);
      }
    }
  }
  const deflectPass = deflectFails === 0;
  if (deflectPass) hardPass++;
  console.log(`[anti-deflection-sweep] (${deflectRuns} runs, N=${DEFLECT_N}/prompt)  ${deflectPass ? "PASS" : "FAIL"} — deflections: ${deflectFails}/${deflectRuns}\n`);

  // WHEN-TO-CARD SWEEP (multi-run): the card-vs-prose decision is the agent's
  // judgment, so run each prompt N times and require ALL to hold — OVER-carding
  // (a card on a narrow ask) AND UNDER-carding (no card on an overview) both
  // fail. render_agenda is registered + the when-to-card rule is in the prompt
  // (KOAST_ENABLE_RENDER_AGENDA forced on in load-env). Erwin host (real agenda).
  // ASYMMETRIC gate. Over-carding (a card on a narrow ask) is the HARMFUL
  // direction — it clutters / rebuilds the dashboard — so it is STRICT 0: any
  // over-card fails. Under-carding (no card on an overview) is graceful
  // degradation — the host still gets a correct prose answer — so it gets a
  // FLOOR, not all-N: "always-card" is an always-do judgment with a sub-100%
  // true rate (~85%), and a tight floor (80%) hugs that estimate and itself
  // false-fails ~1 run in 6. The 70% floor (14/20 at N=20) passes ~98% of runs
  // at true 85% and only fires if the rate genuinely collapses — a regression
  // alarm, not the target. The target is the true ~85% (the host experience).
  const CARD_N = parseInt(process.env.CARD_N ?? "10", 10);
  const OVERVIEW_FLOOR_PCT = 0.70;
  const isAgendaRender = (p: unknown): boolean =>
    !!p && typeof p === "object" && (p as { kind?: unknown }).kind === "agenda";
  const OVERVIEW_PROMPTS = ["What's on today?", "What should I prioritize today?"]; // → card
  const NARROW_PROMPTS = ["When does Erwin check out?", "Draft Erwin a quick reply about the parking question."]; // → prose only
  let overCardFails = 0; // narrow asks that wrongly rendered — strict 0
  let overviewCarded = 0;
  let narrowCarded = 0;
  for (const op of OVERVIEW_PROMPTS) {
    for (let i = 0; i < CARD_N; i++) {
      const run = await runPromptThroughLoop(erwinHostId, op);
      if (isAgendaRender(run.renderPayload)) overviewCarded++;
      else console.log(`   [under-card] "${op}" #${i + 1} — no agenda render (graceful: prose answered)`);
    }
  }
  for (const np of NARROW_PROMPTS) {
    for (let i = 0; i < CARD_N; i++) {
      const run = await runPromptThroughLoop(erwinHostId, np);
      if (run.renderPayload) { overCardFails++; narrowCarded++; console.log(`   [OVER-CARD] "${np}" #${i + 1} — rendered a card (HARMFUL)`); }
    }
  }
  const overviewTotal = OVERVIEW_PROMPTS.length * CARD_N;
  const narrowTotal = NARROW_PROMPTS.length * CARD_N;
  const overviewFloor = Math.ceil(overviewTotal * OVERVIEW_FLOOR_PCT);
  const cardPass = overCardFails === 0 && overviewCarded >= overviewFloor;
  if (cardPass) hardPass++;
  console.log(`[when-to-card-sweep] (${overviewTotal + narrowTotal} runs, N=${CARD_N}/prompt)  ${cardPass ? "PASS" : "FAIL"} — over-card ${narrowCarded}/${narrowTotal} (STRICT 0), overview carded ${overviewCarded}/${overviewTotal} (floor ${overviewFloor})\n`);

  await cleanupEvalConversations(admin, erwinHostId);
  await cleanupEvalConversations(admin, emptyHostId);
  await cleanupEvalConversations(admin, boundaryHostId);
  await cleanupEvalConversations(admin, namelessHostId);
  await cleanupEvalConversations(admin, splitHostId);

  const TOTAL = PROMPTS.length + 5; // + day-boundary + nameless-preamble + split-preamble + anti-deflection-sweep + when-to-card-sweep
  console.log(`SUMMARY: ${hardPass}/${TOTAL} hard-pass`);
  console.log(`JUDGE FAILS (of ${PROMPTS.length}): ${Object.keys(judgeFailTally).length ? Object.entries(judgeFailTally).map(([k, n]) => `${k}=${n}`).join(" ") : "none"}`);
  process.exit(hardPass === TOTAL ? 0 : 1);
}

main().catch((err) => {
  console.error("[agenda-eval] fatal:", err);
  process.exit(2);
});
