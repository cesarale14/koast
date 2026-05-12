export const metadata = { title: "How Koast works on your behalf · Guide · Koast" };

export default function GuideKoastOnYourBehalfPage() {
  return (
    <article
      className="max-w-[640px] text-[15px] text-[var(--deep-sea)]"
      style={{ lineHeight: 1.55 }}
    >
      <h2 className="m-0 mb-4 text-[20px] font-semibold text-[var(--coastal)] leading-tight">
        How Koast works on your behalf
      </h2>

      <p className="m-0 mb-4">
        Different actions carry different stakes. Koast handles them on a
        gradient calibrated to you — not to a default autonomy setting, and not
        to a sliders panel you configure in advance.
      </p>

      <p className="m-0 mb-4">
        <strong>Routine work runs autonomously</strong> once your pattern is
        clear. Calendar syncs from your OTAs, daily recommendation generation
        from the pricing engine, webhook handling for new bookings — these
        happen without surfacing for your review. You see the result in the
        audit log; you can always inspect what Koast did silently.
      </p>

      <p className="m-0 mb-4">
        <strong>Operational decisions surface initially and become quicker</strong>{" "}
        as Koast watches how you react. Mid-stakes work — non-routine guest
        negotiations, rate adjustments outside your usual range, message
        templates Koast hasn&rsquo;t seen you approve before — starts as drafts
        you approve. The approval pattern itself is the signal Koast uses to
        calibrate.
      </p>

      <p className="m-0 mb-4">
        <strong>High-stakes actions always surface.</strong> Large rate moves,
        mass guest communications, anything strategic — these stay in the
        host-approval lane regardless of how often you&rsquo;ve approved similar
        work before, because the stakes ask for explicit oversight every time.
      </p>

      <p className="m-0 mb-4">
        Today the gradient is honest about its cold-start state: the substrate
        that learns from your approval patterns ships in a near-term milestone.
        Until then, more lands in the operational-confirm lane than will
        eventually be there. Calibration becomes meaningfully personalized after
        roughly three weeks of accumulated approvals — enough volume to
        identify what you trust and what you want to keep eyes on.
      </p>

      <p className="m-0">
        You can always inspect and override. The audit drawer (topbar icon)
        shows everything Koast has done; tell Koast to stop doing something
        autonomously, and the gradient adjusts.
      </p>
    </article>
  );
}
