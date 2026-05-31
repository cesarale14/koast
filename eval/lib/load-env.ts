/**
 * load-env — populate process.env from .env.playwright for the agent-behavior
 * eval rig. Pure (node fs only, no `@/` imports) so it can be statically
 * imported by the entry point BEFORE the entry dynamic-imports the `@/`
 * agent modules (which read env when their service clients initialize).
 *
 * The eval runs against the STAGING Supabase project (.env.playwright) with a
 * REAL ANTHROPIC_API_KEY — the loop and the LLM judges both make live model
 * calls, so canned mode is NOT used here (it would never exercise grounding).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEvalEnv(): void {
  const path = resolve(process.cwd(), ".env.playwright");
  if (!existsSync(path)) {
    throw new Error(
      "[eval] .env.playwright not found. The agent-behavior eval needs the staging vars + a real ANTHROPIC_API_KEY (see docs/e2e-playwright.md for the staging shape).",
    );
  }
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "[eval] ANTHROPIC_API_KEY missing. The chat-quality eval runs the REAL loop + LLM judges — both need the key. Add it to .env.playwright.",
    );
  }
  // .env.playwright sets KOAST_E2E_CANNED_AGENT=1 for the Playwright harness.
  // The chat-quality eval MUST run the real model (canned mode returns a fixed
  // string and never exercises grounding) — force it off.
  delete process.env.KOAST_E2E_CANNED_AGENT;
  // Hard guard: NEVER run the eval against prod. The seeding writes rows.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (url.includes("wxxpbgbfebpkvsxhpphb")) {
    throw new Error("[eval] target is PROD — refusing. The eval seeds + deletes rows; staging only.");
  }
  if (!url.includes(process.env.PLAYWRIGHT_EXPECTED_SUPABASE_REF ?? "aljowaggoulsswtxdtmf")) {
    throw new Error("[eval] target is not the expected staging ref — refusing.");
  }
}
