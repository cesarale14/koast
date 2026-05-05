import { readGuestThreadTool, canonicalChannel, canonicalSender } from "../read-guest-thread";
import type { ToolHandlerContext } from "../../types";

jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/supabase/service");

import { verifyPropertyOwnership } from "@/lib/auth/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const THREAD_ID = "33333333-3333-4333-8333-333333333333";

const ctx: ToolHandlerContext = {
  host: { id: HOST_ID },
  conversation_id: "conv-1",
  turn_id: "turn-1",
};

/**
 * Build a thenable Supabase query-builder mock that always resolves to
 * `{ data, error: null }` with the supplied rows. The builder records
 * every `.eq()` / `.order()` / `.limit()` call so tests can assert
 * query shape if needed (none of the tests below need that today, but
 * the recorder makes future regressions cheap to pin down).
 */
function buildQueryMock<T>(
  data: T[] | null,
  error: { message: string } | null = null,
): { eq: jest.Mock; order: jest.Mock; limit: jest.Mock; select: jest.Mock; then: jest.Mock } {
  const result = { data, error };
  const builder: {
    eq: jest.Mock;
    order: jest.Mock;
    limit: jest.Mock;
    select: jest.Mock;
    then: jest.Mock;
  } = {
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => Promise.resolve(result)),
    select: jest.fn(() => builder),
    then: jest.fn((onFulfilled: (v: typeof result) => unknown) => onFulfilled(result)),
  };
  return builder;
}

interface BuilderMock {
  select: jest.Mock;
  eq: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
}

function mockSupabase(handlers: {
  bookings?: BuilderMock;
  message_threads?: BuilderMock;
  messages?: BuilderMock;
}): void {
  (createServiceClient as jest.Mock).mockReturnValue({
    from: jest.fn((table: string) => {
      if (table === "bookings" && handlers.bookings) return handlers.bookings;
      if (table === "message_threads" && handlers.message_threads) return handlers.message_threads;
      if (table === "messages" && handlers.messages) return handlers.messages;
      throw new Error(`unexpected from(${table}) — test did not stub this table`);
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("readGuestThreadTool — declaration", () => {
  test("is a non-gated tool", () => {
    expect(readGuestThreadTool.name).toBe("read_guest_thread");
    expect(readGuestThreadTool.requiresGate).toBe(false);
  });
});

describe("readGuestThreadTool — input schema validation", () => {
  test("accepts minimal input; max_messages defaults to 20", () => {
    const parsed = readGuestThreadTool.inputSchema.safeParse({ booking_id: BOOKING_ID });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.max_messages).toBe(20);
    }
  });

  test("accepts max_messages within 1..50", () => {
    expect(
      readGuestThreadTool.inputSchema.safeParse({ booking_id: BOOKING_ID, max_messages: 1 }).success,
    ).toBe(true);
    expect(
      readGuestThreadTool.inputSchema.safeParse({ booking_id: BOOKING_ID, max_messages: 50 }).success,
    ).toBe(true);
  });

  test("rejects max_messages outside 1..50", () => {
    expect(
      readGuestThreadTool.inputSchema.safeParse({ booking_id: BOOKING_ID, max_messages: 0 }).success,
    ).toBe(false);
    expect(
      readGuestThreadTool.inputSchema.safeParse({ booking_id: BOOKING_ID, max_messages: 51 }).success,
    ).toBe(false);
  });

  test("rejects non-uuid booking_id", () => {
    const parsed = readGuestThreadTool.inputSchema.safeParse({ booking_id: "not-a-uuid" });
    expect(parsed.success).toBe(false);
  });
});

describe("canonicalChannel — channel_code → canonical label", () => {
  test("maps abb / Airbnb spellings to 'airbnb'", () => {
    expect(canonicalChannel("abb")).toBe("airbnb");
    expect(canonicalChannel("ABB")).toBe("airbnb");
    expect(canonicalChannel("airbnb")).toBe("airbnb");
  });

  test("maps bdc / Booking spellings to 'booking_com'", () => {
    expect(canonicalChannel("bdc")).toBe("booking_com");
    expect(canonicalChannel("BDC")).toBe("booking_com");
    expect(canonicalChannel("booking")).toBe("booking_com");
    expect(canonicalChannel("booking.com")).toBe("booking_com");
    expect(canonicalChannel("booking_com")).toBe("booking_com");
  });

  test("maps vrbo / hma to 'vrbo'", () => {
    expect(canonicalChannel("vrbo")).toBe("vrbo");
    expect(canonicalChannel("hma")).toBe("vrbo");
  });

  test("maps null / undefined / empty to 'direct'", () => {
    expect(canonicalChannel(null)).toBe("direct");
    expect(canonicalChannel(undefined)).toBe("direct");
    expect(canonicalChannel("")).toBe("direct");
    expect(canonicalChannel("direct")).toBe("direct");
    expect(canonicalChannel("koast")).toBe("direct");
  });

  test("passes through unknown values lowercased (forward-compat)", () => {
    expect(canonicalChannel("agoda")).toBe("agoda");
  });
});

describe("canonicalSender — messages.sender → agent-facing label", () => {
  test("'guest' stays 'guest'", () => {
    expect(canonicalSender("guest")).toBe("guest");
  });

  test("'property' becomes 'host'", () => {
    expect(canonicalSender("property")).toBe("host");
  });

  test("everything else collapses to 'system'", () => {
    expect(canonicalSender("system")).toBe("system");
    expect(canonicalSender("automated")).toBe("system");
    expect(canonicalSender(null)).toBe("system");
    expect(canonicalSender(undefined)).toBe("system");
  });
});

describe("readGuestThreadTool.handler — happy path", () => {
  test("returns thread + booking with channel mapped from message_threads.channel_code", async () => {
    mockSupabase({
      bookings: buildQueryMock([
        {
          id: BOOKING_ID,
          property_id: PROPERTY_ID,
          guest_name: "Alex Rivera",
          check_in: "2026-05-10",
          check_out: "2026-05-13",
          platform: "airbnb",
        },
      ]) as unknown as BuilderMock,
      message_threads: buildQueryMock([
        { id: THREAD_ID, channel_code: "abb" },
      ]) as unknown as BuilderMock,
      messages: buildQueryMock([
        {
          sender: "guest",
          content: "Hi! Can I check in early?",
          channex_inserted_at: "2026-05-09T14:00:00Z",
          created_at: null,
        },
        {
          sender: "property",
          content: "Hi Alex — let me check.",
          channex_inserted_at: "2026-05-09T14:30:00Z",
          created_at: null,
        },
      ]) as unknown as BuilderMock,
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);

    const result = await readGuestThreadTool.handler(
      { booking_id: BOOKING_ID, max_messages: 20 },
      ctx,
    );

    expect(result.booking.id).toBe(BOOKING_ID);
    expect(result.booking.property_id).toBe(PROPERTY_ID);
    expect(result.booking.guest_name).toBe("Alex Rivera");
    expect(result.booking.check_in).toBe("2026-05-10");
    expect(result.booking.check_out).toBe("2026-05-13");
    expect(result.booking.channel).toBe("airbnb");

    expect(result.thread).toHaveLength(2);
    expect(result.thread[0].sender).toBe("guest");
    expect(result.thread[0].text).toBe("Hi! Can I check in early?");
    expect(result.thread[0].timestamp).toBe("2026-05-09T14:00:00Z");
    expect(result.thread[0].channel).toBe("airbnb");
    expect(result.thread[1].sender).toBe("host");
    expect(result.thread[1].text).toBe("Hi Alex — let me check.");
  });

  test("returns empty thread + booking when no message_threads row exists; channel falls back to bookings.platform", async () => {
    mockSupabase({
      bookings: buildQueryMock([
        {
          id: BOOKING_ID,
          property_id: PROPERTY_ID,
          guest_name: null,
          check_in: "2026-06-01",
          check_out: "2026-06-04",
          platform: "booking_com",
        },
      ]) as unknown as BuilderMock,
      message_threads: buildQueryMock([]) as unknown as BuilderMock,
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);

    const result = await readGuestThreadTool.handler(
      { booking_id: BOOKING_ID, max_messages: 20 },
      ctx,
    );
    expect(result.thread).toEqual([]);
    expect(result.booking.guest_name).toBe("");
    expect(result.booking.channel).toBe("booking_com");
  });
});

describe("readGuestThreadTool.handler — error paths", () => {
  test("throws when booking is not found", async () => {
    mockSupabase({
      bookings: buildQueryMock([]) as unknown as BuilderMock,
    });
    await expect(
      readGuestThreadTool.handler({ booking_id: BOOKING_ID, max_messages: 20 }, ctx),
    ).rejects.toThrow(/Booking .* not found/);
    expect(verifyPropertyOwnership).not.toHaveBeenCalled();
  });

  test("throws when host does not own the property (defense-in-depth)", async () => {
    mockSupabase({
      bookings: buildQueryMock([
        {
          id: BOOKING_ID,
          property_id: PROPERTY_ID,
          guest_name: "Alex",
          check_in: "2026-05-10",
          check_out: "2026-05-13",
          platform: "airbnb",
        },
      ]) as unknown as BuilderMock,
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(false);

    await expect(
      readGuestThreadTool.handler({ booking_id: BOOKING_ID, max_messages: 20 }, ctx),
    ).rejects.toThrow(/does not own property/);
  });
});
