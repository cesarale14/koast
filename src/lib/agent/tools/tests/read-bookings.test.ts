/**
 * read_bookings (P3.1) — proves the upcoming-bookings read maps host-scoped
 * booking rows to an id-lean booking blocks payload (a valid render payload),
 * joins the property name, and is exposure-gated on the render flag in lockstep
 * with the prompt (the generative-UI invariant).
 */

jest.mock("@/lib/supabase/service");

import { readBookingsTool } from "../read-bookings";
import { activeAnthropicTools } from "../index";
import { buildSystemPrompt } from "../../system-prompt";
import { createServiceClient } from "@/lib/supabase/service";
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
      neq: () => b,
      gte: () => b,
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

describe("read_bookings", () => {
  test("maps host bookings to an id-lean booking blocks payload (+ property name join)", async () => {
    (createServiceClient as jest.Mock).mockReturnValue(
      fakeSvc({
        properties: [{ id: "p1", name: "Villa Jamaica", timezone: "America/New_York" }],
        bookings: [
          {
            property_id: "p1",
            platform: "airbnb",
            guest_name: "Jeremy",
            check_in: "2026-06-12",
            check_out: "2026-06-15",
            num_guests: 3,
            total_price: "640.00",
            status: "confirmed",
          },
        ],
      }),
    );

    const out = await readBookingsTool.handler({}, CTX);
    expect(renderPayloadSchema.safeParse(out).success).toBe(true);
    expect(out.kind).toBe("blocks");
    if (out.kind === "blocks") {
      expect(out.blocks).toHaveLength(1);
      expect(out.blocks[0]).toEqual({
        kind: "booking",
        data: {
          guestName: "Jeremy",
          checkIn: "2026-06-12",
          checkOut: "2026-06-15",
          platform: "airbnb",
          totalPrice: 640,
          numGuests: 3,
          propertyName: "Villa Jamaica",
        },
      });
      // id-lean: no booking/property id leaked into the block
      expect(JSON.stringify(out.blocks[0])).not.toContain("p1");
    }
  });

  test("no owned properties → empty blocks (never another host's bookings)", async () => {
    (createServiceClient as jest.Mock).mockReturnValue(fakeSvc({ properties: [] }));
    const out = await readBookingsTool.handler({}, CTX);
    expect(out.kind).toBe("blocks");
    if (out.kind === "blocks") expect(out.blocks).toHaveLength(0);
  });

  test("exposure-gated on the render flag, in lockstep with the prompt", () => {
    const KEY = "KOAST_ENABLE_RENDER_AGENDA";
    const prev = process.env[KEY];
    try {
      delete process.env[KEY];
      expect(activeAnthropicTools().some((t) => t.name === "read_bookings")).toBe(false);
      expect(buildSystemPrompt().includes("read_bookings")).toBe(false);
      process.env[KEY] = "true";
      expect(activeAnthropicTools().some((t) => t.name === "read_bookings")).toBe(true);
      expect(buildSystemPrompt().includes("read_bookings")).toBe(true);
    } finally {
      if (prev === undefined) delete process.env[KEY];
      else process.env[KEY] = prev;
    }
  });
});
