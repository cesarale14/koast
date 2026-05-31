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
  host: "erwin" | "empty";
  prompt: string;
  grounding?: string[]; // ALL must appear (real seeded items)
  groundingAny?: string[]; // at least ONE must appear
  mustCallTool?: string;
  emptyAck?: boolean; // must acknowledge an empty agenda (not deflect)
  // Answer reproduces verbatim quoted/forwarded guest content (e.g. a thread).
  // The surface-form judges (emoji/exclamation) false-positive on the guest's
  // own punctuation; skip them so the rig self-reports a clean verdict.
  quotedContent?: boolean;
}

const PROMPTS: PromptSpec[] = [
  { id: "prioritize-today", host: "erwin", prompt: "What should I prioritize today?", grounding: ["Erwin", "Sara"] },
  { id: "anything-missing", host: "erwin", prompt: "Anything I'm missing today?", grounding: ["Erwin", "Sara"] },
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
    groundedIn,
    looksLikeGenericChecklist,
    judgeVerdicts,
  } = await import("./lib/chat-eval");
  const { adminClient, seedAgendaFixtures, cleanupEvalConversations } = await import("./agenda-fixtures");

  const admin = adminClient();
  console.log("seeding agenda fixtures (staging)…");
  const { erwinHostId, emptyHostId } = await seedAgendaFixtures(admin);
  const hostId = (h: PromptSpec["host"]) => (h === "erwin" ? erwinHostId : emptyHostId);

  console.log(`\n=== AGENDA EVAL${mode !== "RUN" ? ` (${mode})` : ""} — ${PROMPTS.length} prompts ===\n`);

  let hardPass = 0;
  const judgeFailTally: Record<string, number> = {};

  for (const spec of PROMPTS) {
    const run = await runPromptThroughLoop(hostId(spec.host), spec.prompt);
    const text = run.text;

    const failures: string[] = [];
    if (run.error) failures.push(`loop-error: ${run.error}`);
    if (!text) failures.push("empty-output");
    if (deflectsVisibility(text)) failures.push("VISIBILITY-DEFLECTION");
    if (leaksUuid(text)) failures.push("UUID-LEAK");
    if (spec.grounding) {
      const g = groundedIn(text, spec.grounding);
      if (!g.ok) failures.push(`grounding-missing[${g.missing.join(",")}]`);
    }
    if (spec.groundingAny) {
      const hit = spec.groundingAny.some((t) => text.toLowerCase().includes(t.toLowerCase()));
      if (!hit) failures.push(`grounding-any-missing[${spec.groundingAny.join("|")}]`);
    }
    if (spec.mustCallTool && !run.toolCalls.includes(spec.mustCallTool)) {
      failures.push(`tool-not-called[${spec.mustCallTool}]`);
    }
    if (spec.emptyAck && !EMPTY_ACK.test(text)) failures.push("no-empty-acknowledgment");

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

  await cleanupEvalConversations(admin, erwinHostId);
  await cleanupEvalConversations(admin, emptyHostId);

  console.log(`SUMMARY: ${hardPass}/${PROMPTS.length} hard-pass`);
  console.log(`JUDGE FAILS (of ${PROMPTS.length}): ${Object.keys(judgeFailTally).length ? Object.entries(judgeFailTally).map(([k, n]) => `${k}=${n}`).join(" ") : "none"}`);
  process.exit(hardPass === PROMPTS.length ? 0 : 1);
}

main().catch((err) => {
  console.error("[agenda-eval] fatal:", err);
  process.exit(2);
});
