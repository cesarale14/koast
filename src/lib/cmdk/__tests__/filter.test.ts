import type { CmdKEntry } from "../types";
import { filterEntries } from "../filter";
import { STATIC_ROUTES, STATIC_ACTIONS } from "../static";

const villa: CmdKEntry = {
  id: "prop:villa",
  kind: "property",
  label: "Villa Jamaica",
  hint: "4105 N Jamaica St, Tampa",
  keywords: ["Villa Jamaica", "Tampa", "4105 N Jamaica St"],
  href: "/properties/villa",
};

const cozy: CmdKEntry = {
  id: "prop:cozy",
  kind: "property",
  label: "Cozy Loft - Tampa",
  hint: "4105 N Jamaica St, Tampa",
  keywords: ["Cozy Loft - Tampa", "Tampa", "4105 N Jamaica St"],
  href: "/properties/cozy",
};

const recentConvo: CmdKEntry = {
  id: "conv:abc",
  kind: "conversation",
  label: "Why is next weekend $184?",
  hint: "Villa Jamaica",
  keywords: ["Why is next weekend $184?", "Villa Jamaica"],
  href: "/chat/abc",
};

describe("Cmd+K filter — correctness", () => {
  test("empty query returns all entries sorted by kind priority", () => {
    const all = [villa, cozy, ...STATIC_ROUTES.slice(0, 2), ...STATIC_ACTIONS];
    const out = filterEntries(all, "");
    // properties first (kind priority 0), then routes (1), then actions (3)
    expect(out[0].kind).toBe("property");
    expect(out[1].kind).toBe("property");
    // remaining entries follow kind priority
    const kinds = out.slice(2).map((e) => e.kind);
    expect(kinds).toContain("route");
    expect(kinds.indexOf("action")).toBeGreaterThan(kinds.indexOf("route"));
  });

  test("whitespace-only query treated as empty", () => {
    expect(filterEntries([villa, cozy], "   ").length).toBe(2);
  });

  test("exact label match ranks highest", () => {
    const out = filterEntries([villa, cozy], "villa jamaica");
    expect(out[0].id).toBe("prop:villa");
  });

  test("token-prefix surfaces 'tampa' → both Tampa properties", () => {
    const out = filterEntries([villa, cozy], "tampa");
    expect(out.length).toBe(2);
    const ids = out.map((e) => e.id);
    expect(ids).toContain("prop:villa");
    expect(ids).toContain("prop:cozy");
  });

  test("address-token surfaces property — 'jamaica st' → Villa Jamaica + Cozy Loft (both at same address)", () => {
    const out = filterEntries([villa, cozy], "jamaica");
    expect(out.length).toBe(2);
    // Villa Jamaica ranks higher (token-prefix on primary keyword
    // "Villa Jamaica" beats token-prefix on secondary "4105 N Jamaica St")
    expect(out[0].id).toBe("prop:villa");
  });

  test("substring match surfaces routes — 'rate' → Pricing", () => {
    const out = filterEntries(STATIC_ROUTES, "rate");
    const labels = out.map((e) => e.label);
    expect(labels).toContain("Pricing");
  });

  test("no match returns empty list", () => {
    const out = filterEntries([villa, cozy], "zzzznonexistent");
    expect(out.length).toBe(0);
  });

  test("conversations are matchable by preview text", () => {
    const out = filterEntries([recentConvo], "weekend");
    expect(out.length).toBe(1);
    expect(out[0].id).toBe("conv:abc");
  });

  test("kind tiebreak — property beats route on equal substring score", () => {
    // Construct two entries where neither label is exactly the query
    // AND both surface via the same tier (substring on secondary
    // keyword). Score parity ensures the kind-priority tiebreak is
    // what determines order.
    const prop: CmdKEntry = {
      id: "prop:fake",
      kind: "property",
      // Avoid exact-label or token-prefix wins on the query "xyz"
      label: "Place A",
      keywords: ["Place A", "downtown xyz district"],
      href: "/properties/fake",
    };
    const route: CmdKEntry = {
      id: "route:/fake",
      kind: "route",
      label: "Route B",
      keywords: ["Route B", "downtown xyz district"],
      href: "/fake",
    };
    const out = filterEntries([route, prop], "xyz");
    // Both substring-match on secondary keyword → identical score →
    // kind tiebreak picks property first.
    expect(out[0].kind).toBe("property");
    expect(out[1].kind).toBe("route");
  });

  test("case-insensitive", () => {
    expect(filterEntries([villa], "VILLA").length).toBe(1);
    expect(filterEntries([villa], "Villa").length).toBe(1);
    expect(filterEntries([villa], "villa").length).toBe(1);
  });

  test("action entries surface by verb keywords", () => {
    const out = filterEntries(STATIC_ACTIONS, "new chat");
    const labels = out.map((e) => e.label);
    expect(labels).toContain("New conversation");
  });
});

describe("Cmd+K filter — performance (M13 Phase 1.B fluidity budget)", () => {
  // Builds a synthetic 300-entry index — bigger than any host's
  // realistic Cmd+K substrate (15 props + 14 routes + 3 actions + 20
  // recent conversations = 52 entries today; 300 is the 1.B scaling
  // headroom envelope per doctrine "3→300 property scaling").
  function buildLargeIndex(): CmdKEntry[] {
    const out: CmdKEntry[] = [];
    // 250 synthetic properties
    for (let i = 0; i < 250; i++) {
      out.push({
        id: `prop:${i}`,
        kind: "property",
        label: `Property ${i} - ${["Tampa", "Miami", "Austin", "Denver", "Boston"][i % 5]}`,
        hint: `${i} ${["Main", "Oak", "Elm", "Pine"][i % 4]} St`,
        keywords: [
          `Property ${i}`,
          ["Tampa", "Miami", "Austin", "Denver", "Boston"][i % 5],
          `${i} ${["Main", "Oak", "Elm", "Pine"][i % 4]} St`,
        ],
        href: `/properties/${i}`,
      });
    }
    // 20 synthetic recent conversations
    for (let i = 0; i < 20; i++) {
      out.push({
        id: `conv:${i}`,
        kind: "conversation",
        label: `Question ${i} about rates`,
        keywords: [`Question ${i} about rates`, "rates"],
        href: `/chat/conv-${i}`,
      });
    }
    // Plus the real route + action sets (~17 entries)
    out.push(...STATIC_ROUTES, ...STATIC_ACTIONS);
    return out;
  }

  // Builds a small index of the same SHAPE as buildLargeIndex but ~24×
  // smaller — the baseline for the load-invariant scaling assertion.
  function buildSmallIndex(): CmdKEntry[] {
    const out: CmdKEntry[] = [];
    for (let i = 0; i < 8; i++) {
      out.push({
        id: `prop:${i}`,
        kind: "property",
        label: `Property ${i} - ${["Tampa", "Miami"][i % 2]}`,
        hint: `${i} ${["Main", "Oak"][i % 2]} St`,
        keywords: [
          `Property ${i}`,
          ["Tampa", "Miami"][i % 2],
          `${i} ${["Main", "Oak"][i % 2]} St`,
        ],
        href: `/properties/${i}`,
      });
    }
    out.push(...STATIC_ROUTES.slice(0, 3), ...STATIC_ACTIONS.slice(0, 1));
    return out;
  }

  const PERF_QUERIES = [
    "tampa",
    "rate",
    "pric",
    "settings",
    "new chat",
    "ques",
    "p",
    "100",
    "main",
    "calendar",
  ];

  function timeFilterPass(index: CmdKEntry[], iterations: number): number {
    // Warm up (shed first-call JIT) then time `iterations` full query
    // passes. Returns total elapsed ms.
    for (const q of PERF_QUERIES) filterEntries(index, q);
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (const q of PERF_QUERIES) filterEntries(index, q);
    }
    return performance.now() - start;
  }

  test("filter scales ~linearly — no algorithmic (O(n²)) regression", () => {
    // M13 Phase 1.B follow-on (perf-test de-flake): the PURPOSE of this
    // gate is to catch an algorithmic regression (e.g. an accidental
    // O(n²) introduced into the filter), NOT to measure absolute speed.
    // Absolute wall-clock assertions flake under machine load (the
    // failure that triggered this rewrite happened at load avg ~7.5).
    //
    // Per operator msg 3527 — "generous tolerance with production rollup
    // as the eventual truth-source; the contract in the manifest is what
    // matters most; don't let CI noise block work" — the in-suite gate
    // is now a LOAD-INVARIANT scaling ratio. Both the small-index and
    // large-index passes run on the same (loaded or idle) machine, so
    // scheduling jitter cancels in the ratio. Absolute latency lives in
    // scripts/fluidity-budgets.json + the production host_surface_
    // telemetry perf rows (budget_class='cmd_k_first_result').
    //
    // ~24× more entries (12 → 287). Linear filter → ratio ≈ 24×.
    // O(n²) → ratio ≈ 24² ≈ 576×. Assert ratio < 100 — comfortably
    // above linear + constant-factor + load noise, comfortably below a
    // genuine O(n²) blow-up.
    const small = buildSmallIndex();
    const large = buildLargeIndex();
    expect(large.length).toBe(287); // 250 + 20 + 14 + 3
    const sizeRatio = large.length / small.length; // ~24×

    const ITER = 200; // enough that each measurement is tens of ms (stable)
    const smallMs = Math.max(timeFilterPass(small, ITER), 0.5); // floor: no div-by-~0
    const largeMs = timeFilterPass(large, ITER);

    const timeRatio = largeMs / smallMs;
    // Linear would give ~sizeRatio; allow a generous 4× headroom over
    // linear for constant factors + jitter; still far below O(n²).
    expect(timeRatio).toBeLessThan(sizeRatio * 4);
  });

  test("filter correctness holds at the 287-entry scale (the perf index)", () => {
    // Pair the (timing-free) correctness check with the scaling test so
    // a regression that breaks results at scale is still caught even if
    // the timing ratio is within bounds.
    const large = buildLargeIndex();
    const out = filterEntries(large, "tampa");
    // Every "Tampa" synthetic property (250/5 = 50) should surface.
    expect(out.filter((e) => e.kind === "property").length).toBe(50);
    expect(filterEntries(large, "zzzznope").length).toBe(0);
  });
});
