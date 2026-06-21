import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PricingReasoning from "@/components/dashboard/PricingReasoning";

/**
 * /pricing — the agent's pricing reasoning made browsable (design pass Phase 3).
 * Replaces the DS-forbidden signal-cards-with-progress-bars PricingDashboard with
 * PricingReasoning (scorecard → recommendations-through-the-ProposalCard →
 * track-record → the adopted PricingTab editor). Section data is fetched
 * client-side by the sections' own hooks/APIs, so this page only resolves the
 * property set.
 */
export default async function PricingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const propertiesRes = await supabase
    .from("properties")
    .select("id, name")
    .eq("user_id", user.id)
    .order("name");
  const properties = (propertiesRes.data ?? []) as { id: string; name: string }[];

  if (properties.length === 0) {
    return (
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: "var(--deep-sea)", letterSpacing: "-0.01em" }}>
          Pricing
        </h1>
        <p style={{ margin: "6px 0 28px", fontSize: 15, color: "var(--tideline)" }}>
          What Koast sees in your rates, what it suggests, and how its calls have landed.
        </p>
        <div
          style={{
            border: "1px solid var(--hairline)",
            borderRadius: 14,
            background: "var(--white)",
            padding: "56px 24px",
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--deep-sea)" }}>No properties yet</p>
          <p style={{ margin: "8px 0 20px", fontSize: 14, color: "var(--tideline)" }}>
            Add a property and Koast starts watching its rates.
          </p>
          <Link
            href="/properties"
            style={{
              display: "inline-flex",
              padding: "11px 18px",
              borderRadius: 10,
              background: "var(--coastal)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Add a property
          </Link>
        </div>
      </div>
    );
  }

  return <PricingReasoning properties={properties} />;
}
