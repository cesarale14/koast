/**
 * markdown-strip-eval — RED/GREEN for the deterministic markdown strip-pass.
 *
 * Two cases, both asserting NO markdown in the new turn — on the STREAMED text
 * (display) AND the PERSISTED content_text (the priming vector that re-enters
 * history):
 *   1. FRESH overview on clean history — proves the fresh path stays clean.
 *   2. PRIMED continuation — history carries a markdown assistant turn; the same
 *      overview tempts the model to mirror it. This is the leak vector that a
 *      prompt-only rule can't stop; RED on pre-strip code, GREEN after.
 *
 * The strip is deterministic, so GREEN is a hard 0/N regardless of model whim —
 * not a probabilistic floor. Run: `npx tsx eval/markdown-strip-eval.ts`.
 */
import { loadEvalEnv } from "./lib/load-env";

async function main() {
  loadEvalEnv();
  // Force the PROSE path. The markdown leak lives in prose; when render_agenda
  // is on, an overview CARDS and the prose is a clean summary, masking the
  // vector. With render off the overview answers in prose — exactly the regime
  // the prod leak (823dafd2) occurred in (render wasn't enabled then). The strip
  // protects every prose surface; this forces the turn to BE a prose surface.
  process.env.KOAST_ENABLE_RENDER_AGENDA = "0";
  const N = parseInt(process.env.MD_N ?? "12", 10);
  const { runPromptThroughLoop, rawMarkdown } = await import("./lib/chat-eval");
  const { adminClient, seedAgendaFixtures, seedPrimedMarkdownConversation, cleanupEvalConversations } =
    await import("./agenda-fixtures");
  const admin = adminClient();
  const { erwinHostId } = await seedAgendaFixtures(admin);
  // Fresh case uses a plain overview (proves the common path stays clean).
  const FRESH_PROMPT = "What should I be focused on today?";
  // Primed case asks the model to repeat the SAME breakdown it just gave in
  // markdown — "same breakdown" maximizes format-mirroring, the leak vector.
  const PRIMED_PROMPT = "Perfect — same breakdown, and add tomorrow too.";

  const fetchPersisted = async (turnId: string | null): Promise<string> => {
    if (!turnId) return "";
    const { data } = await admin
      .from("agent_turns")
      .select("content_text")
      .eq("id", turnId)
      .single();
    return ((data?.content_text as string | null) ?? "");
  };

  // Real chain. A clean unprimed turn 1 won't emit markdown (the Format rule
  // holds), so we IGNITE it with an injected seed turn (turn 0) — but turn 1 and
  // turn 2 are BOTH real (real model calls through finalizeTurn). Turn 1 is the
  // mirror trigger (emits markdown → finalizeTurn must strip its persist); turn 2
  // is a plain follow-up whose only markdown source is mirroring turn 1's
  // PERSISTED output — clean in GREEN because turn 1 was stripped.
  const CHAIN_T1 = "Perfect — same breakdown, and add tomorrow too.";
  const CHAIN_T2 = "And who's waiting on a reply right now?";

  let freshStream = 0, freshPersist = 0, primedStream = 0, primedPersist = 0;
  let chainT1Persist = 0, chainT2Persist = 0;

  // CASE 1 — fresh overview on clean history.
  for (let i = 0; i < N; i++) {
    const run = await runPromptThroughLoop(erwinHostId, FRESH_PROMPT);
    const sMd = rawMarkdown(run.text);
    if (sMd.length) { freshStream++; console.log(`[fresh stream-md] #${i + 1} [${sMd}] :: ${run.text.replace(/\n/g, "\\n").slice(0, 90)}`); }
    const pMd = rawMarkdown(await fetchPersisted(run.turnId));
    if (pMd.length) { freshPersist++; console.log(`[fresh persist-md] #${i + 1} [${pMd}]`); }
  }

  // CASE 2 — primed continuation (the leak vector).
  for (let i = 0; i < N; i++) {
    const convId = await seedPrimedMarkdownConversation(erwinHostId);
    const run = await runPromptThroughLoop(erwinHostId, PRIMED_PROMPT, { conversationId: convId });
    const sMd = rawMarkdown(run.text);
    if (sMd.length) { primedStream++; console.log(`[primed stream-md] #${i + 1} [${sMd}] :: ${run.text.replace(/\n/g, "\\n").slice(0, 90)}`); }
    const pMd = rawMarkdown(await fetchPersisted(run.turnId));
    if (pMd.length) { primedPersist++; console.log(`[primed persist-md] #${i + 1} [${pMd}]`); }
  }

  // CASE 3 — REAL two-turn chain: turn 0 is an injected markdown seed (ignition),
  // then turn 1 and turn 2 are BOTH real turns through finalizeTurn. Turn 1
  // (primed) emits markdown → assert its PERSISTED content_text is clean
  // (finalizeTurn stripped a REAL turn's output). Turn 2 runs off turn 1's
  // reconstructed history → assert clean (not primed by turn 1's now-clean text).
  // Proves the persist → clean-history → no-priming link with real turns.
  for (let i = 0; i < N; i++) {
    const convId = await seedPrimedMarkdownConversation(erwinHostId);
    const t1 = await runPromptThroughLoop(erwinHostId, CHAIN_T1, { conversationId: convId });
    const t1Md = rawMarkdown(await fetchPersisted(t1.turnId));
    if (t1Md.length) { chainT1Persist++; console.log(`[chain T1 persist-md] #${i + 1} [${t1Md}]`); }
    const t2 = await runPromptThroughLoop(erwinHostId, CHAIN_T2, { conversationId: convId });
    const t2Md = rawMarkdown(await fetchPersisted(t2.turnId));
    if (t2Md.length) { chainT2Persist++; console.log(`[chain T2 persist-md] #${i + 1} [${t2Md}]`); }
  }

  await cleanupEvalConversations(admin, erwinHostId);

  const pass =
    freshStream === 0 && freshPersist === 0 &&
    primedStream === 0 && primedPersist === 0 &&
    chainT1Persist === 0 && chainT2Persist === 0;
  console.log(`\n[markdown-strip-eval] ${pass ? "PASS" : "FAIL"} (N=${N}/case)`);
  console.log(`  FRESH       — stream-md ${freshStream}/${N}, persist-md ${freshPersist}/${N}   (want 0 / 0)`);
  console.log(`  PRIMED(inj) — stream-md ${primedStream}/${N}, persist-md ${primedPersist}/${N}   (want 0 / 0)`);
  console.log(`  REAL CHAIN  — T1 persist-md ${chainT1Persist}/${N}, T2 persist-md ${chainT2Persist}/${N}   (want 0 / 0)`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
