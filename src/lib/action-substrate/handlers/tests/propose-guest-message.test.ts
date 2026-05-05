import { proposeGuestMessageHandler } from "../propose-guest-message";
import { ColdSendUnsupportedError } from "../errors";

jest.mock("@/lib/supabase/service");
jest.mock("@/lib/auth/api-auth");
jest.mock("@/lib/channex/messages", () => {
  // Re-export the real ChannexSendError class so `instanceof` checks
  // line up at call sites; only sendMessage / sendMessageOnBooking
  // are jest.fn'd.
  const actual = jest.requireActual("@/lib/channex/messages");
  return {
    __esModule: true,
    ...actual,
    sendMessage: jest.fn(),
    sendMessageOnBooking: jest.fn(),
  };
});

import { createServiceClient } from "@/lib/supabase/service";
import { verifyPropertyOwnership } from "@/lib/auth/api-auth";
import {
  sendMessage as channexSendMessage,
  sendMessageOnBooking as channexSendMessageOnBooking,
  ChannexSendError,
} from "@/lib/channex/messages";

const HOST_ID = "00000000-0000-0000-0000-000000000aaa";
const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const THREAD_ID = "33333333-3333-4333-8333-333333333333";
const CHANNEX_THREAD_ID = "cx-thread-001";
const CHANNEX_MESSAGE_ID = "cx-msg-42";
const ARTIFACT_ID = "44444444-4444-4444-8444-444444444444";
const NEW_MESSAGE_ROW_ID = "55555555-5555-4555-8555-555555555555";

interface RowsResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/** Build a thenable Supabase query-builder that resolves to {data, error}. */
function buildQueryBuilder<T>(result: RowsResult<T>): {
  select: jest.Mock;
  upsert: jest.Mock;
  update: jest.Mock;
  eq: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  single: jest.Mock;
  then: jest.Mock;
} {
  const builder: ReturnType<typeof buildQueryBuilder<T>> = {
    select: jest.fn(() => builder),
    upsert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => Promise.resolve(result)),
    single: jest.fn(() =>
      Promise.resolve(
        result.data && result.data.length > 0
          ? { data: result.data[0], error: result.error }
          : { data: null, error: result.error ?? { message: "no row" } },
      ),
    ),
    then: jest.fn((onFulfilled: (v: RowsResult<T>) => unknown) => onFulfilled(result)),
  };
  return builder;
}

interface SupabaseMockShape {
  bookings?: ReturnType<typeof buildQueryBuilder>;
  message_threads?: ReturnType<typeof buildQueryBuilder>;
  messages?: ReturnType<typeof buildQueryBuilder>;
}

function mockSupabase(handlers: SupabaseMockShape): {
  fromMock: jest.Mock;
} {
  const fromMock = jest.fn((table: string) => {
    if (table === "bookings" && handlers.bookings) return handlers.bookings;
    if (table === "message_threads" && handlers.message_threads) return handlers.message_threads;
    if (table === "messages" && handlers.messages) return handlers.messages;
    throw new Error(`unexpected from(${table}) — test did not stub this table`);
  });
  (createServiceClient as jest.Mock).mockReturnValue({ from: fromMock });
  return { fromMock };
}

const channexMessageEntity = {
  id: CHANNEX_MESSAGE_ID,
  type: "message" as const,
  attributes: {
    message: "Hi! 3pm check-in works great.",
    sender: "property" as const,
    inserted_at: "2026-05-09T15:00:00Z",
    updated_at: "2026-05-09T15:00:00Z",
    attachments: null,
    meta: null,
  },
};

const baseInput = {
  host_id: HOST_ID,
  conversation_id: "conv-1",
  turn_id: "turn-1",
  artifact_id: ARTIFACT_ID,
  payload: {
    booking_id: BOOKING_ID,
    message_text: "Hi! 3pm check-in works great.",
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("proposeGuestMessageHandler — happy path", () => {
  test("sends via Channex, upserts messages with actor_kind='agent', refreshes thread aggregate", async () => {
    const messagesBuilder = buildQueryBuilder({ data: [{ id: NEW_MESSAGE_ROW_ID }], error: null });
    mockSupabase({
      bookings: buildQueryBuilder({ data: [{ id: BOOKING_ID, property_id: PROPERTY_ID }], error: null }),
      message_threads: buildQueryBuilder({
        data: [{ id: THREAD_ID, channex_thread_id: CHANNEX_THREAD_ID, channel_code: "abb", property_id: PROPERTY_ID }],
        error: null,
      }),
      messages: messagesBuilder,
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);
    (channexSendMessage as jest.Mock).mockResolvedValue(channexMessageEntity);

    const result = await proposeGuestMessageHandler(baseInput);

    expect(result).toEqual({
      channex_message_id: CHANNEX_MESSAGE_ID,
      message_id: NEW_MESSAGE_ROW_ID,
      channel: "airbnb",
    });

    // Channex called with thread's channex_thread_id + draft text.
    expect(channexSendMessage).toHaveBeenCalledWith(
      CHANNEX_THREAD_ID,
      "Hi! 3pm check-in works great.",
    );

    // messages.upsert was called with actor_kind='agent', actor_id=null,
    // host_send_* fields populated. Verify the payload shape.
    const upsertCall = messagesBuilder.upsert.mock.calls[0]?.[0];
    expect(upsertCall.actor_kind).toBe("agent");
    expect(upsertCall.actor_id).toBeNull();
    expect(upsertCall.channex_message_id).toBe(CHANNEX_MESSAGE_ID);
    expect(upsertCall.platform).toBe("airbnb");
    expect(upsertCall.direction).toBe("outbound");
    expect(upsertCall.draft_status).toBe("sent");
    expect(typeof upsertCall.host_send_submitted_at).toBe("string");
    expect(typeof upsertCall.host_send_channex_acked_at).toBe("string");
  });

  test("uses edited_text when present, preferring it over message_text", async () => {
    mockSupabase({
      bookings: buildQueryBuilder({ data: [{ id: BOOKING_ID, property_id: PROPERTY_ID }], error: null }),
      message_threads: buildQueryBuilder({
        data: [{ id: THREAD_ID, channex_thread_id: CHANNEX_THREAD_ID, channel_code: "abb", property_id: PROPERTY_ID }],
        error: null,
      }),
      messages: buildQueryBuilder({ data: [{ id: NEW_MESSAGE_ROW_ID }], error: null }),
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);
    (channexSendMessage as jest.Mock).mockResolvedValue(channexMessageEntity);

    await proposeGuestMessageHandler({
      ...baseInput,
      payload: {
        ...baseInput.payload,
        edited_text: "Hi! 3pm works — door code is 4827. See you then.",
      },
    });

    expect(channexSendMessage).toHaveBeenCalledWith(
      CHANNEX_THREAD_ID,
      "Hi! 3pm works — door code is 4827. See you then.",
    );
  });

  test("maps channel_code='bdc' → platform='booking_com' on the messages row", async () => {
    const messagesBuilder = buildQueryBuilder({ data: [{ id: NEW_MESSAGE_ROW_ID }], error: null });
    mockSupabase({
      bookings: buildQueryBuilder({ data: [{ id: BOOKING_ID, property_id: PROPERTY_ID }], error: null }),
      message_threads: buildQueryBuilder({
        data: [{ id: THREAD_ID, channex_thread_id: CHANNEX_THREAD_ID, channel_code: "bdc", property_id: PROPERTY_ID }],
        error: null,
      }),
      messages: messagesBuilder,
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);
    (channexSendMessage as jest.Mock).mockResolvedValue(channexMessageEntity);

    await proposeGuestMessageHandler(baseInput);

    expect(messagesBuilder.upsert.mock.calls[0]?.[0].platform).toBe("booking_com");
  });
});

describe("proposeGuestMessageHandler — idempotency on retry", () => {
  test("short-circuits when commit_metadata.channex_message_id is already set", async () => {
    // Even with a fully-mocked supabase + Channex, the idempotency
    // guard fires first and avoids any send call.
    mockSupabase({
      bookings: buildQueryBuilder({ data: [{ id: BOOKING_ID, property_id: PROPERTY_ID }], error: null }),
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);

    const result = await proposeGuestMessageHandler({
      ...baseInput,
      commit_metadata: {
        channex_message_id: "cx-msg-prior",
        message_id: "msg-row-prior",
      },
    });

    // Idempotency-short-circuit returns commit_metadata.channel when
    // present, falling back to 'direct' when the prior write didn't
    // record one (legacy artifacts pre-channel-write). The test's
    // commit_metadata omits `channel`, so 'direct' is the fallback.
    expect(result).toEqual({
      channex_message_id: "cx-msg-prior",
      message_id: "msg-row-prior",
      channel: "direct",
    });
    expect(channexSendMessage).not.toHaveBeenCalled();
  });

  test("does NOT short-circuit when only channex_message_id is set without message_id (partial-success window)", async () => {
    // The narrow window where Channex 200'd but the local upsert hiccupped.
    // commit_metadata.channex_message_id may be set but message_id isn't,
    // so the handler proceeds — Channex re-send is OK (Channex itself
    // is the source of truth for the OTA delivery; idempotency at our
    // layer protects the more typical retry case).
    const messagesBuilder = buildQueryBuilder({ data: [{ id: NEW_MESSAGE_ROW_ID }], error: null });
    mockSupabase({
      bookings: buildQueryBuilder({ data: [{ id: BOOKING_ID, property_id: PROPERTY_ID }], error: null }),
      message_threads: buildQueryBuilder({
        data: [{ id: THREAD_ID, channex_thread_id: CHANNEX_THREAD_ID, channel_code: "abb", property_id: PROPERTY_ID }],
        error: null,
      }),
      messages: messagesBuilder,
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);
    (channexSendMessage as jest.Mock).mockResolvedValue(channexMessageEntity);

    await proposeGuestMessageHandler({
      ...baseInput,
      commit_metadata: { channex_message_id: "cx-msg-prior" },
    });

    expect(channexSendMessage).toHaveBeenCalled();
  });
});

describe("proposeGuestMessageHandler — cold-send (no local thread row, M7 CF #44)", () => {
  const COLD_BOOKING_ID = "77777777-7777-4777-8777-777777777777";
  const COLD_CHANNEX_BOOKING_ID = "cx-booking-99";
  const COLD_NEW_CHANNEX_THREAD_ID = "cx-thread-new-99";
  const COLD_NEW_LOCAL_THREAD_ID = "88888888-8888-4888-8888-888888888888";
  const COLD_NEW_CHANNEX_MSG_ID = "cx-msg-cold-99";

  const coldChannexMessageEntity = {
    id: COLD_NEW_CHANNEX_MSG_ID,
    type: "message" as const,
    attributes: {
      message: "Hi Gretter, thanks for booking Villa Jamaica!",
      sender: "property" as const,
      inserted_at: "2026-05-05T07:00:00Z",
      updated_at: "2026-05-05T07:00:00Z",
      attachments: null,
      meta: null,
    },
    relationships: {
      message_thread: { data: { id: COLD_NEW_CHANNEX_THREAD_ID, type: "message_thread" } },
    },
  };

  const coldBaseInput = {
    host_id: HOST_ID,
    conversation_id: "conv-cold",
    turn_id: "turn-cold",
    artifact_id: "art-cold",
    payload: {
      booking_id: COLD_BOOKING_ID,
      message_text: "Hi Gretter, thanks for booking Villa Jamaica!",
    },
  };

  /**
   * The cold-send path makes 4 sequential calls to from('message_threads'):
   *   1. Initial lookup (returns 0 rows — triggers cold-send branch)
   *   2. Upsert (ignoreDuplicates) — non-fatal even on race
   *   3. SELECT by channex_thread_id (resolves local thread.id)
   *   4. UPDATE for thread aggregates (refresh)
   * Mock with a queue so each call gets the right builder shape.
   */
  function mockColdSendSupabase(opts: {
    bookingChannexId: string | null;
    bookingPlatform?: string;
    threadInsertError?: { message: string } | null;
    resolvedThreadAfterColdSend?: { id: string; channex_thread_id: string; channel_code: string; property_id: string } | null;
    /** property_channels row for the (property_id, channel_code) match.
     *  null = no row (G2 trigger). 'ical-import' channex_channel_id = G3 sentinel.
     *  Default: a real UUID row matching the booking platform.
     */
    propertyChannel?:
      | { channex_channel_id: string; channel_code: string; status?: string }
      | null;
    propertyName?: string;
  }) {
    const bookingsBuilder = buildQueryBuilder({
      data: [
        {
          id: COLD_BOOKING_ID,
          property_id: PROPERTY_ID,
          channex_booking_id: opts.bookingChannexId,
          platform: opts.bookingPlatform ?? "booking_com",
        },
      ],
      error: null,
    });

    const threadCallQueue = [
      buildQueryBuilder({ data: [], error: null }), // 1. initial lookup — no thread
      buildQueryBuilder({ data: null, error: opts.threadInsertError ?? null }), // 2. upsert
      buildQueryBuilder({
        data: opts.resolvedThreadAfterColdSend
          ? [opts.resolvedThreadAfterColdSend]
          : [
              {
                id: COLD_NEW_LOCAL_THREAD_ID,
                channex_thread_id: COLD_NEW_CHANNEX_THREAD_ID,
                channel_code: "bdc",
                property_id: PROPERTY_ID,
              },
            ],
        error: null,
      }), // 3. SELECT after cold-send
      buildQueryBuilder({ data: null, error: null }), // 4. UPDATE refresh
    ];

    const propertyBuilder = buildQueryBuilder({
      data: [{ name: opts.propertyName ?? "Test Villa" }],
      error: null,
    });

    // G2/G3/G4 lookup against property_channels. Default = real UUID
    // row matching the booking platform's uppercase channel_code.
    const platformToCode =
      (opts.bookingPlatform ?? "booking_com") === "airbnb"
        ? "ABB"
        : (opts.bookingPlatform ?? "booking_com") === "booking_com"
          ? "BDC"
          : "VRBO";
    const defaultPropertyChannel = {
      channex_channel_id: "real-uuid-default",
      channel_code: platformToCode,
      status: "active",
    };
    const propertyChannel =
      opts.propertyChannel === null
        ? null
        : (opts.propertyChannel ?? defaultPropertyChannel);
    const propertyChannelsBuilder = buildQueryBuilder({
      data: propertyChannel ? [propertyChannel] : [],
      error: null,
    });

    const messagesBuilder = buildQueryBuilder({
      data: [{ id: NEW_MESSAGE_ROW_ID }],
      error: null,
    });

    let threadCallIdx = 0;
    const fromMock = jest.fn((table: string) => {
      if (table === "bookings") return bookingsBuilder;
      if (table === "messages") return messagesBuilder;
      if (table === "message_threads") return threadCallQueue[threadCallIdx++];
      if (table === "properties") return propertyBuilder;
      if (table === "property_channels") return propertyChannelsBuilder;
      throw new Error(`unexpected from(${table}) — test did not stub this table`);
    });
    (createServiceClient as jest.Mock).mockReturnValue({ from: fromMock });
    return { messagesBuilder };
  }

  test("happy path: no thread + valid channex_booking_id → cold-send via POST /bookings/:id/messages, materializes thread row, upserts message", async () => {
    const { messagesBuilder } = mockColdSendSupabase({
      bookingChannexId: COLD_CHANNEX_BOOKING_ID,
      bookingPlatform: "booking_com",
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);
    (channexSendMessageOnBooking as jest.Mock).mockResolvedValue(coldChannexMessageEntity);

    const result = await proposeGuestMessageHandler(coldBaseInput);

    expect(channexSendMessageOnBooking).toHaveBeenCalledWith(
      COLD_CHANNEX_BOOKING_ID,
      "Hi Gretter, thanks for booking Villa Jamaica!",
    );
    expect(channexSendMessage).not.toHaveBeenCalled(); // existing-thread path NOT taken

    // Thread upsert payload: includes channex_thread_id from response,
    // channel_code from booking.platform via channelCodeFromProvider,
    // initial message_count=1.
    // (We can't easily intercept the upsert call args without
    // restructuring buildQueryBuilder; the structural assertions below
    // cover the visible behavior.)

    // messages upsert wired to the resolved local thread.id
    const msgUpsertCall = messagesBuilder.upsert.mock.calls[0]?.[0];
    expect(msgUpsertCall.thread_id).toBe(COLD_NEW_LOCAL_THREAD_ID);
    expect(msgUpsertCall.actor_kind).toBe("agent");
    expect(msgUpsertCall.actor_id).toBeNull();
    expect(msgUpsertCall.channex_message_id).toBe(COLD_NEW_CHANNEX_MSG_ID);

    expect(result).toEqual({
      channex_message_id: COLD_NEW_CHANNEX_MSG_ID,
      message_id: NEW_MESSAGE_ROW_ID,
      channel: "booking_com", // canonicalChannel('bdc') from resolved thread
    });
  });

  test("G1 — rejects with ColdSendUnsupportedError(gate='no-channex-booking') when booking has no channex_booking_id", async () => {
    mockColdSendSupabase({ bookingChannexId: null });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);

    await expect(proposeGuestMessageHandler(coldBaseInput)).rejects.toMatchObject({
      name: "ColdSendUnsupportedError",
      gate: "no-channex-booking",
      message: expect.stringMatching(/cannot be messaged via Channex/),
    });
    await expect(proposeGuestMessageHandler(coldBaseInput)).rejects.toBeInstanceOf(
      ColdSendUnsupportedError,
    );
    expect(channexSendMessageOnBooking).not.toHaveBeenCalled();
    expect(channexSendMessage).not.toHaveBeenCalled();
  });

  test("G2 — rejects with ColdSendUnsupportedError(gate='no-property-channel') when no property_channels row matches (property, platform)", async () => {
    mockColdSendSupabase({
      bookingChannexId: COLD_CHANNEX_BOOKING_ID,
      bookingPlatform: "booking_com",
      propertyChannel: null,
      propertyName: "Sunny Beach Cottage",
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);

    await expect(proposeGuestMessageHandler(coldBaseInput)).rejects.toMatchObject({
      name: "ColdSendUnsupportedError",
      gate: "no-property-channel",
      message: expect.stringMatching(
        /Sunny Beach Cottage is not yet configured for messaging on Booking\.com/,
      ),
    });
    expect(channexSendMessageOnBooking).not.toHaveBeenCalled();
  });

  test("G3 — rejects with ColdSendUnsupportedError(gate='ical-import') for iCal-import sentinel ('ical-' prefix)", async () => {
    mockColdSendSupabase({
      bookingChannexId: COLD_CHANNEX_BOOKING_ID,
      bookingPlatform: "airbnb",
      propertyChannel: { channex_channel_id: "ical-import", channel_code: "ABB", status: "active" },
      propertyName: "Cozy Loft - Tampa",
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);

    await expect(proposeGuestMessageHandler(coldBaseInput)).rejects.toMatchObject({
      name: "ColdSendUnsupportedError",
      gate: "ical-import",
      message: expect.stringMatching(/Cozy Loft - Tampa is connected via iCal only on Airbnb/),
    });
    expect(channexSendMessageOnBooking).not.toHaveBeenCalled();
  });

  test("G4 — rejects with ColdSendUnsupportedError(gate='abb-cold-send-cf45') for ABB cold-send pending CF #45", async () => {
    mockColdSendSupabase({
      bookingChannexId: COLD_CHANNEX_BOOKING_ID,
      bookingPlatform: "airbnb",
      propertyChannel: {
        channex_channel_id: "93f436bc-00ee-4b2d-a761-bb67ccb0294d",
        channel_code: "ABB",
        status: "active",
      },
      propertyName: "Villa Jamaica",
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);

    await expect(proposeGuestMessageHandler(coldBaseInput)).rejects.toMatchObject({
      name: "ColdSendUnsupportedError",
      gate: "abb-cold-send-cf45",
      message: expect.stringMatching(/Cold-send to Villa Jamaica via Airbnb is not yet supported/),
    });
    await expect(proposeGuestMessageHandler(coldBaseInput)).rejects.toThrow(/CF #45/);
    expect(channexSendMessageOnBooking).not.toHaveBeenCalled();
  });

  test("rejects when Channex response omits relationships.message_thread.data.id (defensive — endpoint stays 'D' status)", async () => {
    mockColdSendSupabase({
      bookingChannexId: COLD_CHANNEX_BOOKING_ID,
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);
    (channexSendMessageOnBooking as jest.Mock).mockResolvedValue({
      ...coldChannexMessageEntity,
      relationships: {}, // no message_thread relationship
    });

    await expect(proposeGuestMessageHandler(coldBaseInput)).rejects.toThrow(
      /no relationships\.message_thread\.data\.id/,
    );
  });

  test("ChannexSendError on the cold-send endpoint propagates verbatim (route handles §6 failure encoding)", async () => {
    mockColdSendSupabase({ bookingChannexId: COLD_CHANNEX_BOOKING_ID });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);
    (channexSendMessageOnBooking as jest.Mock).mockRejectedValue(
      new ChannexSendError("Channex application not installed", 403, { errors: [] }),
    );

    await expect(proposeGuestMessageHandler(coldBaseInput)).rejects.toBeInstanceOf(
      ChannexSendError,
    );
  });

  test("idempotency on retry: short-circuit fires equally for cold-send when commit_metadata.{channex_message_id, message_id} already present", async () => {
    // Same idempotency guard as existing-thread path; verifies cold-send
    // doesn't re-trigger Channex if the prior attempt already
    // round-tripped through.
    mockColdSendSupabase({ bookingChannexId: COLD_CHANNEX_BOOKING_ID });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);

    const result = await proposeGuestMessageHandler({
      ...coldBaseInput,
      commit_metadata: {
        channex_message_id: "cx-msg-prior-cold",
        message_id: "msg-row-prior-cold",
        channel: "booking_com",
      },
    });

    expect(channexSendMessageOnBooking).not.toHaveBeenCalled();
    expect(channexSendMessage).not.toHaveBeenCalled();
    expect(result).toEqual({
      channex_message_id: "cx-msg-prior-cold",
      message_id: "msg-row-prior-cold",
      channel: "booking_com",
    });
  });
});

describe("proposeGuestMessageHandler — error paths", () => {
  test("Channex failure propagates ChannexSendError up to the caller (route handles §6 failure encoding)", async () => {
    mockSupabase({
      bookings: buildQueryBuilder({ data: [{ id: BOOKING_ID, property_id: PROPERTY_ID }], error: null }),
      message_threads: buildQueryBuilder({
        data: [{ id: THREAD_ID, channex_thread_id: CHANNEX_THREAD_ID, channel_code: "abb", property_id: PROPERTY_ID }],
        error: null,
      }),
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(true);
    (channexSendMessage as jest.Mock).mockRejectedValue(
      new ChannexSendError("thread closed", 422, { errors: [{ title: "thread closed" }] }),
    );

    await expect(proposeGuestMessageHandler(baseInput)).rejects.toBeInstanceOf(ChannexSendError);
  });

  test("rejects when booking is not found", async () => {
    mockSupabase({
      bookings: buildQueryBuilder({ data: [], error: null }),
    });

    await expect(proposeGuestMessageHandler(baseInput)).rejects.toThrow(/Booking .* not found/);
    expect(verifyPropertyOwnership).not.toHaveBeenCalled();
    expect(channexSendMessage).not.toHaveBeenCalled();
  });

  test("rejects when host does not own the property (defense-in-depth)", async () => {
    mockSupabase({
      bookings: buildQueryBuilder({ data: [{ id: BOOKING_ID, property_id: PROPERTY_ID }], error: null }),
    });
    (verifyPropertyOwnership as jest.Mock).mockResolvedValue(false);

    await expect(proposeGuestMessageHandler(baseInput)).rejects.toThrow(/does not own property/);
    expect(channexSendMessage).not.toHaveBeenCalled();
  });

  // Note: prior M7 had a "rejects when no message_threads row exists"
  // test pinning the throw "No message thread for booking" path. M7 CF
  // #44 replaced that path with cold-send (POST /bookings/:id/messages);
  // the no-thread case now branches to cold-send and only rejects when
  // booking.channex_booking_id is also missing. That coverage moved to
  // the cold-send describe block above ("rejects with clear error when
  // booking has no channex_booking_id").
});
