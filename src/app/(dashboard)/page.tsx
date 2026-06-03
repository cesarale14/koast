/**
 * "/" cold surface. The chat-primary layout branch passes this page's render as
 * ChatClient's coldSlot (proven by the Phase 0 spike: RSC + Suspense streams
 * through the client layout, shell paints instantly, swap is seamless).
 *
 * INTERIM (pre Phase 3 sign-off): renders null → coldSlot is nullish → ChatClient
 * falls back to the EmptyState, i.e. "/" cold is unchanged. Phase 3 replaces this
 * with <Suspense fallback={<TodayHomeSkeleton/>}><TodayHomeServer/></Suspense>
 * (readTodayHome + <TodayHome/>) once the component is signed off.
 */
export default function DashboardPage() {
  return null;
}
