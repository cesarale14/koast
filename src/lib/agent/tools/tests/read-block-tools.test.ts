jest.mock("@/lib/supabase/service");
jest.mock("@/lib/today/readTodayTurnovers");

import { readTurnoversTool } from "../read-turnovers";
import { readPricingTool } from "../read-pricing";
import { activeAnthropicTools } from "../index";
import { buildSystemPrompt } from "../../system-prompt";
import { createServiceClient } from "@/lib/supabase/service";
import { readTodayTurnovers } from "@/lib/today/readTodayTurnovers";
import { renderPayloadSchema } from "@/lib/agent/render/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CTX = { host: { id: "host-1" } } as any;

type Seed = Record<string, Record<string, unknown>[]>;
function fakeSvc(seed: Seed) {
  function from(table: string) {
    const result = { data: seed[table] ?? [], error: null };
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      in: () => b,
      is: () => b,
      not: () => b,
      order: () => b,
      limit: () => Promise.resolve(result),
      then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
    };
    return b;
  }
  return { from };
}

beforeEach(() => jest.clearAllMocks());

describe("read_turnovers", () => {
  test("returns an id-lean turnover blocks payload (valid render payload)", async () => {
    (createServiceClient as jest.Mock).mockReturnValue(
      fakeSvc({ properties: [{ timezone: "America/New_York" }] }),
    );
    (readTodayTurnovers as jest.Mock).mockResolvedValue({
      turnovers: [
        { taskId: "t1", property: "Villa", date: "2026-06-12", status: "pending", cleanerName: null, photoCount: 0 },
        { taskId: "t2", property: "Loft", date: "2026-06-13", status: "completed", cleanerName: "Karem", photoCount: 2 },
      ],
      cleaners: [],
    });

    const out = await readTurnoversTool.handler({}, CTX);
    expect(renderPayloadSchema.safeParse(out).success).toBe(true);
    expect(out.kind).toBe("blocks");
    if (out.kind === "blocks") {
      expect(out.blocks[0]).toEqual({
        kind: "turnover",
        data: { property: "Villa", date: "2026-06-12", status: "pending", cleanerName: null, photoCount: 0 },
      });
      // id-lean: taskId never leaves the tool boundary.
      expect(JSON.stringify(out.blocks)).not.toContain("t1");
      expect(JSON.stringify(out.blocks)).not.toContain("t2");
    }
  });
});

describe("read_pricing", () => {
  test("maps pending recommendations to price_diff blocks (numeric coercion)", async () => {
    (createServiceClient as jest.Mock).mockReturnValue(
      fakeSvc({
        properties: [{ id: "p1" }],
        pricing_recommendations_latest: [
          // Postgres numerics may arrive as strings — assert coercion.
          { date: "2026-06-12", current_rate: "180", suggested_rate: "205", delta_abs: "25", reason_text: "Event nearby", urgency: "act_now" },
        ],
      }),
    );
    const out = await readPricingTool.handler({}, CTX);
    expect(renderPayloadSchema.safeParse(out).success).toBe(true);
    if (out.kind === "blocks") {
      expect(out.blocks[0]).toEqual({
        kind: "price_diff",
        data: { date: "2026-06-12", currentRate: 180, suggestedRate: 205, deltaAbs: 25, reason: "Event nearby", urgency: "act_now" },
      });
    }
  });

  test("returns an empty payload when the host has no properties", async () => {
    (createServiceClient as jest.Mock).mockReturnValue(fakeSvc({ properties: [] }));
    const out = await readPricingTool.handler({}, CTX);
    expect(out).toEqual({ v: 1, kind: "blocks", blocks: [] });
  });
});

describe("block-read tools — exposure ↔ prompt lockstep (same flag as render_agenda)", () => {
  const KEY = "KOAST_ENABLE_RENDER_AGENDA";
  const prev = process.env[KEY];
  afterEach(() => {
    if (prev === undefined) delete process.env[KEY];
    else process.env[KEY] = prev;
  });

  const exposed = () => {
    const names = activeAnthropicTools().map((t) => t.name);
    return names.includes("read_turnovers") && names.includes("read_pricing");
  };
  const advertised = () => {
    const p = buildSystemPrompt();
    return /read_turnovers/.test(p) && /read_pricing/.test(p);
  };

  test("flag OFF: block-read tools in NEITHER the tools array NOR the prompt", () => {
    delete process.env[KEY];
    expect(exposed()).toBe(false);
    expect(advertised()).toBe(false);
  });

  test("flag ON: block-read tools in BOTH", () => {
    process.env[KEY] = "1";
    expect(exposed()).toBe(true);
    expect(advertised()).toBe(true);
  });

  test("exposure and advertisement agree in every state (toggled live)", () => {
    for (const v of [undefined, "1", undefined, "1"]) {
      if (v === undefined) delete process.env[KEY];
      else process.env[KEY] = v;
      expect(exposed()).toBe(advertised());
    }
  });
});
