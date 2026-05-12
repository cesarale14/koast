import { CapabilityRow } from "@/components/guide/CapabilityRow";

export const metadata = { title: "Capabilities · Guide · Koast" };

export default function GuideCapabilitiesPage() {
  return (
    <article className="max-w-[640px]">
      <p
        className="m-0 mb-8 text-[15px] text-[var(--deep-sea)]"
        style={{ lineHeight: 1.55 }}
      >
        Koast surfaces what your operation actually does. Tabs in your sidebar
        reflect your accumulated state — Dashboard, Properties, Messages, and
        Pricing are always present; the rest appear once the underlying data
        exists. Below is what each surface covers.
      </p>

      <CapabilityRow name="Dashboard" visibility="always">
        The home surface. Today&rsquo;s bookings, your portfolio at a glance,
        the pricing intelligence hero — a confidence-banded range over upcoming
        weekend recommendations — and action cards drawn from work that needs
        attention. Dashboard is where you land after sign-in; everything else
        branches from here.
      </CapabilityRow>

      <CapabilityRow name="Properties" visibility="always">
        One card per property. Each carries the current status, the next
        check-in, connected platforms, and a hover affordance to inspect channel
        health. Clicking a property opens its detail surface — Overview,
        Calendar, Pricing — and the per-property memory Koast has accumulated.
      </CapabilityRow>

      <CapabilityRow name="Messages" visibility="always">
        Your guest inbox, consolidated across Airbnb, Booking.com, and direct.
        Koast drafts replies when you ask; when a draft would need a fact Koast
        doesn&rsquo;t yet have — wifi credentials, door code, parking — it
        surfaces a host-input-needed prompt for the missing piece first, so the
        draft is grounded.
      </CapabilityRow>

      <CapabilityRow name="Pricing" visibility="always">
        Read-only intelligence today: rate calendar with engine recommendations,
        per-date signal breakdown, apply-suggestion flow per property. The
        9-signal engine writes recommendations daily; you approve and Koast
        pushes to Channex. Auto-apply is gated on accumulated validation data
        and isn&rsquo;t on yet.
      </CapabilityRow>

      <CapabilityRow
        name="Calendar"
        visibility="conditional"
        predicate="Appears when at least one booking exists across your properties."
      >
        Monthly grid of all booked nights across your properties, with bookings
        rendered as dark bars carrying platform logos. Per-channel rate editor
        in the right panel. The tab appears as soon as your first reservation
        lands via iCal sync or Channex webhook.
      </CapabilityRow>

      <CapabilityRow
        name="Reviews"
        visibility="conditional"
        predicate="Appears when at least one guest review has synced from a platform."
      >
        Drafted review responses for your approval. Surfaces once a guest review
        syncs from a connected platform; stays hidden until then because
        there&rsquo;s nothing to review.
      </CapabilityRow>

      <CapabilityRow
        name="Turnovers"
        visibility="conditional"
        predicate="Appears when at least one cleaning task exists."
      >
        Cleaning task list per property, with cleaner assignments, SMS dispatch,
        and per-task status. Appears once you&rsquo;ve created your first task —
        manually, or automatically from a checkout booking.
      </CapabilityRow>

      <CapabilityRow
        name="Market Intel"
        visibility="conditional"
        predicate="Appears once your property&rsquo;s local market data has synced."
      >
        Local market context: comp-set ADR, occupancy, demand score, with
        charts. Appears once your property has at least one market snapshot
        recorded — typically within a day of property setup.
      </CapabilityRow>

      <CapabilityRow
        name="Comp Sets"
        visibility="conditional"
        predicate="Appears once comparable listings have been mapped for at least one property."
      >
        Your property pinned above a sortable table of comparable listings —
        bedrooms, ADR, occupancy, distance. Same data layer as Market Intel;
        both surface once comparables are mapped.
      </CapabilityRow>
    </article>
  );
}
