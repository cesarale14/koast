/**
 * /koast/inspect/memory — F1 ships full implementation next.
 *
 * C5 places this placeholder so the Memory tab in InspectTabBar resolves
 * cleanly to a real route during the F1 implementation gap. Voice copy
 * locked at C5 design sign-off (Decision 5).
 */

export default function MemoryPlaceholderPage() {
  return (
    <div className="rounded-[12px] border border-[var(--hairline)] bg-white p-8">
      <p className="text-[14px] leading-[1.6] text-[var(--coastal)] max-w-prose">
        This will list every fact Koast keeps about your properties &mdash;
        door codes, wifi, parking, anything you&rsquo;ve told it in chat.
        The inspection surface ships next; the memory itself is already
        live.
      </p>
    </div>
  );
}
