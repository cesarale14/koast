export const metadata = { title: "How memory works · Guide · Koast" };

export default function GuideMemoryPage() {
  return (
    <article
      className="max-w-[640px] text-[15px] text-[var(--deep-sea)]"
      style={{ lineHeight: 1.55 }}
    >
      <h2 className="m-0 mb-4 text-[20px] font-semibold text-[var(--coastal)] leading-tight">
        How memory works
      </h2>

      <p className="m-0 mb-4">
        Koast&rsquo;s memory is what makes the agent get sharper the longer it
        runs. Every conversation deposits structured knowledge — not chat-log
        retention, but parsed facts with scope, attribute, value, source,
        confidence, and history.
      </p>

      <p className="m-0 mb-4">Four categories accumulate per host:</p>

      <p className="m-0 mb-4">
        <strong>Property memory</strong> captures operational facts about
        specific properties — the front door that needs to come out
        horizontally, the dishwasher that requires a three-second hold, the AC
        drain that overflows when neglected. Each fact is scoped to the right
        entity (the front door at this property, not &ldquo;doors in
        general&rdquo;) and persists once captured.
      </p>

      <p className="m-0 mb-4">
        <strong>Guest memory</strong> builds per-guest preferences, history, and
        prior interactions across stays.
      </p>

      <p className="m-0 mb-4">
        <strong>Voice memory</strong> learns how you write — your cadence, your
        vocabulary, the way you sign off — so drafted guest messages stay
        recognizably yours at scale.
      </p>

      <p className="m-0 mb-4">
        <strong>Operational memory</strong> accumulates the patterns behind your
        decisions: how you handle late checkouts, the rate moves you tend to
        approve, vendor reliability, seasonal intuitions.
      </p>

      <p className="m-0 mb-4">
        Every fact carries provenance: directly taught by you, inferred from a
        pattern, or observed in connected platform data. Higher-confidence facts
        can be applied autonomously; lower-confidence ones surface for
        confirmation. You can inspect the trail any time via the Memory tab.
      </p>

      <p className="m-0">
        This memory is your asset, not Koast&rsquo;s. You can browse it any time
        and correct anything. Export tooling that gives you a structured
        download of everything Koast has accumulated is on the near-term
        roadmap — we build the moat on accumulated value, not on hostile
        lock-in.
      </p>
    </article>
  );
}
