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
    throw new Error(
      "[e2e] .env.playwright not found. Create it from .env.staging (see docs/e2e-playwright.md). The harness must NEVER source .env.local (prod).",
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
