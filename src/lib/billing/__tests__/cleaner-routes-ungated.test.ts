/**
 * Hard invariant (P5): the cleaner token routes are NEVER plan-gated. They auth by
 * a per-task token (no host session), so plan gating cannot and must not apply — a
 * cleaner doing their job is never a billing decision. This structural test fails
 * if anyone wires requireProAccess / PlanGateError into a /api/clean route.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const CLEAN_ROOT = join(process.cwd(), "src/app/api/clean");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

test("no /api/clean route imports the plan gate", () => {
  const files = walk(CLEAN_ROOT);
  expect(files.length).toBeGreaterThan(0); // sanity: we actually scanned routes
  const offenders = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    return /requireProAccess|PlanGateError|hasProAccess|billing\/gate/.test(src);
  });
  expect(offenders).toEqual([]);
});
