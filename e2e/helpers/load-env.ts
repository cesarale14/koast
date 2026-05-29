/**
 * load-env — read .env.playwright into process.env WITHOUT clobbering
 * vars already set (so an explicit shell export wins, and we never
 * accidentally pull from .env.local).
 *
 * No dotenv dependency — minimal parser. Loaded once from
 * playwright.config.ts before anything else.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadPlaywrightEnv(): void {
  const path = resolve(process.cwd(), ".env.playwright");
  if (!existsSync(path)) {
    // CI path: the harness env is injected directly (workflow `env:` +
    // `${{ secrets.* }}`), so there is no .env.playwright file to read.
    // That's fine AS LONG AS the critical vars are already present — the
    // prod-guard still validates the target ref downstream. Locally the
    // file is required (and we must NEVER fall back to .env.local / prod).
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return;
    }
    throw new Error(
      "[e2e] .env.playwright not found and harness env is not present in the environment. Locally: create it from .env.staging (see docs/e2e-playwright.md). In CI: set the staging vars via workflow env + secrets. The harness must NEVER source .env.local (prod).",
    );
  }
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}
