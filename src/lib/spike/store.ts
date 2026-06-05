/* ============================================================================
 * THROWAWAY DE-RISKING SPIKE — in-memory subscription holder.
 * NOT a production model. No DB, no cleaner_push_subscriptions table, no
 * migration. Held on globalThis so it survives module reloads within ONE warm
 * serverless instance only — it is explicitly NOT durable across Vercel lambda
 * instances or cold starts. The reliable closed-app test path passes the
 * subscription explicitly in the /api/spike/test-push body (the page prints a
 * ready-to-run command). This holder is a best-effort convenience.
 * ==========================================================================*/

import type { PushSubscription as WebPushSubscription } from "web-push";

export interface HeldSub {
  subscription: WebPushSubscription;
  url: string;
  at: string;
}

const g = globalThis as unknown as { __koastSpikeHeld?: HeldSub | null };

export function holdSubscription(s: HeldSub): void {
  g.__koastSpikeHeld = s;
}

export function lastHeldSubscription(): HeldSub | null {
  return g.__koastSpikeHeld ?? null;
}
