/**
 * "/" cold surface. The chat-primary layout branch passes this page's render as
 * ChatClient's coldSlot (proven by the Phase 0 spike: RSC + Suspense streams
 * through the client layout, shell paints instantly, swap is seamless).
 *
 * P1.2 (v1 program) — Today-home go-live. Replaces the interim `return null`
 * (which fell back to the chat EmptyState) with the real Today surface:
 * <Suspense fallback={<TodayHomeSkeleton/>}><TodayHomeServer/></Suspense>
 * (readTodayHome → <TodayHome/>). Read-only — no agent loop, no actions, no
 * writes. The slow rollup streams behind Suspense so the shell paints instantly.
 * Visual sign-off batches to acceptance A2.
 */
import { Suspense } from "react";
import { TodayHomeServer } from "@/components/today/TodayHomeServer";
import { TodayHomeSkeleton } from "@/components/today/TodayHomeSkeleton";

export default function DashboardPage() {
  return (
    <Suspense fallback={<TodayHomeSkeleton />}>
      <TodayHomeServer />
    </Suspense>
  );
}
