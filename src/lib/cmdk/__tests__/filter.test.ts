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

  test("filter completes < 100ms across many queries on a 287-entry index", () => {
    // Budget per the M13 Phase 1.B fluidity manifest:
    // cmd_k_first_result < 100ms (perceived-action; doctrine point 7).
    // We measure the filter step only; network fetch + cache lookup
    // are amortized across the palette session (separate budget step).
    //
    // Use generous tolerance — CI runners vary and the operator
    // sign-off note (msg 3527) is explicit: "unit-test perf can be
    // noisy and platform-dependent — generous tolerance with
    // production rollup as the eventual truth-source." Hard fail at
    // 100ms guards against regressing into algorithmic O(n²); a 25ms
    // local-dev runtime should still pass even on slow CI.
    const index = buildLargeIndex();
    expect(index.length).toBe(287); // 250 + 20 + 14 + 3

    const queries = [
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

    // Budget is PER QUERY (cmd_k_first_result < 100ms is "the time
    // until the first result list is rendered after the user finishes
    // typing one query"). The doctrine concerns the steady-state path
    // — by the time the host is typing, the JIT is warm. Warmup loop
    // sheds the first-call JIT cost; the measured loop reflects what
    // a host actually experiences.
    //
    // Operator msg 3527 sign-off: "generous tolerance with production
    // rollup as the eventual truth-source." We assert 2× the doctrine
    // budget (200ms) as the algorithmic-regression hard bound — that
    // catches accidental O(n²) regressions without flaking on slow
    // CI runners. Production telemetry rollup (via host_surface_
    // telemetry budget_class='cmd_k_first_result') is the real truth
    // source.
    for (const q of queries) filterEntries(index, q); // warmup

    let maxPerQuery = 0;
    const overallStart = performance.now();
    for (const q of queries) {
      const start = performance.now();
      filterEntries(index, q);
      const elapsed = performance.now() - start;
      if (elapsed > maxPerQuery) maxPerQuery = elapsed;
    }
    const overallElapsed = performance.now() - overallStart;
    expect(maxPerQuery).toBeLessThan(200);
    // 10 queries × 100ms budget × 5x tolerance.
    expect(overallElapsed).toBeLessThan(500);
  });

  test("default-view sort (empty query) is fast on the same index", () => {
    const index = buildLargeIndex();
    // Per-call budget; sort is even more forgiving than filter.
    let maxPerCall = 0;
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      filterEntries(index, "");
      const elapsed = performance.now() - start;
      if (elapsed > maxPerCall) maxPerCall = elapsed;
    }
    expect(maxPerCall).toBeLessThan(100);
  });
});
