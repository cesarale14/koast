/**
 * send_guest_reply (P3.2) — the proposals-lane action that sends a host-approved
 * guest reply through the M7 Channex single-writer. Pins the safety contract:
 *   - NEVER auto-approvable (structural: isAutoApproveEnabled false + omitted
 *     from the settings meta) — host approval is the only send path.
 *   - NO DOUBLE-SEND error classification: ChannexSendError / ColdSendUnsupported
 *     → {ok:false} (re-approvable; nothing was sent); ANY OTHER throw (post-200
 *     local hiccup) RE-THROWS so the proposal can't become re-approvable for a
 *     re-send (the atomic claim keeps it 'approved').
 *   - prior result threads into the handler's commit_metadata (idempotency).
 * proposeGuestMessageHandler is mocked; the real M7 send is covered by its own
 * suite + the live A3 proof.
 */

jest.mock("@/lib/action-substrate/handlers/propose-guest-message");

import {
  getProposalActionDef,
  getProposalActionMeta,
  isAutoApproveEnabled,
} from "../server";
import { proposeGuestMessageHandler } from "@/lib/action-substrate/handlers/propose-guest-message";
import { ChannexSendError } from "@/lib/channex/messages";
import { ColdSendUnsupportedError } from "@/lib/action-substrate/handlers/errors";

const mockHandler = proposeGuestMessageHandler as jest.MockedFunction<
  typeof proposeGuestMessageHandler
>;

const HOST = "host-1";
// execute() does not use svc (proposeGuestMessageHandler makes its own client).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const svc = {} as any;
const payload = { action: { bookingId: "b1", messageText: "3pm check-in works." } };

beforeEach(() => jest.clearAllMocks());

describe("send_guest_reply — never auto-approvable (structural)", () => {
  test("isAutoApproveEnabled returns false WITHOUT reading the prefs table", async () => {
    const svcSpy = { from: jest.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await isAutoApproveEnabled(svcSpy as any, HOST, "send_guest_reply");
    expect(r).toBe(false);
    // Structural short-circuit: no pref read at all (defense beyond the toggle).
    expect(svcSpy.from).not.toHaveBeenCalled();
  });

  test("getProposalActionMeta OMITS send_guest_reply (the toggle never exists)", () => {
    const types = getProposalActionMeta().map((m) => m.actionType);
    expect(types).not.toContain("send_guest_reply");
    // The genuinely auto-approvable actions are still surfaced.
    expect(types).toContain("assign_cleaner");
    expect(types).toContain("notify_cleaner");
  });
});

describe("send_guest_reply.execute — adapter + no-double-send", () => {
  const def = getProposalActionDef("send_guest_reply")!;

  test("is registered, non-OTA, medium, neverAutoApprove", () => {
    expect(def).toBeDefined();
    expect(def.otaTouching).toBe(false);
    expect(def.stakesClass).toBe("medium");
    expect(def.neverAutoApprove).toBe(true);
  });

  test("happy path → calls the M7 single-writer; returns the channex ids as summary", async () => {
    mockHandler.mockResolvedValue({
      channex_message_id: "cm1",
      message_id: "m1",
      channel: "airbnb",
    });
    const r = await def.execute(svc, { payload, hostId: HOST });
    expect(r.ok).toBe(true);
    expect((r as { ok: true; summary: Record<string, unknown> }).summary).toEqual({
      channex_message_id: "cm1",
      message_id: "m1",
      channel: "airbnb",
    });
    const arg = mockHandler.mock.calls[0][0];
    expect(arg.host_id).toBe(HOST);
    expect(arg.payload).toEqual({ booking_id: "b1", message_text: "3pm check-in works." });
  });

  test("idempotency: prior proposals.result threads into the handler commit_metadata", async () => {
    mockHandler.mockResolvedValue({ channex_message_id: "cm1", message_id: "m1", channel: "airbnb" });
    await def.execute(svc, {
      payload,
      hostId: HOST,
      result: { channex_message_id: "cm1", message_id: "m1", channel: "airbnb" },
    });
    const arg = mockHandler.mock.calls[0][0];
    expect(arg.commit_metadata).toEqual({
      channex_message_id: "cm1",
      message_id: "m1",
      channel: "airbnb",
    });
  });

  test("ChannexSendError → {ok:false} (re-approvable; Channex did NOT send)", async () => {
    mockHandler.mockRejectedValue(new ChannexSendError("thread closed", 422, {}));
    const r = await def.execute(svc, { payload, hostId: HOST });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: string }).error).toMatch(/thread closed/);
  });

  test("ColdSendUnsupportedError → {ok:false} (re-approvable)", async () => {
    mockHandler.mockRejectedValue(
      new ColdSendUnsupportedError("iCal only on Airbnb", "ical-import"),
    );
    const r = await def.execute(svc, { payload, hostId: HOST });
    expect(r.ok).toBe(false);
  });

  test("2xx ChannexSendError (200-no-data, AMBIGUOUS) → RE-THROWS (never re-sends)", async () => {
    // The "200 with no data" case: Channex accepted the request and MAY have
    // created the message. Classifying it as 'not sent' (re-approvable) would
    // risk a double-send — so a 2xx ChannexSendError must re-throw, not {ok:false}.
    mockHandler.mockRejectedValue(new ChannexSendError("returned no data", 200, {}));
    await expect(def.execute(svc, { payload, hostId: HOST })).rejects.toBeInstanceOf(
      ChannexSendError,
    );
  });

  test("non-2xx ChannexSendError (true OTA rejection) → {ok:false} (re-approvable)", async () => {
    mockHandler.mockRejectedValue(new ChannexSendError("rejected", 422, {}));
    const r = await def.execute(svc, { payload, hostId: HOST });
    expect(r.ok).toBe(false);
  });

  test("post-Channex-200 GENERIC error → RE-THROWS (no re-send path created)", async () => {
    // The message MAY already be on the OTA; re-throwing keeps the proposal
    // 'approved' (un-reclaimable by the atomic claim) so it never re-sends.
    mockHandler.mockRejectedValue(new Error("DB upsert failed after Channex 200"));
    await expect(def.execute(svc, { payload, hostId: HOST })).rejects.toThrow(/DB upsert failed/);
  });

  test("missing action fields → {ok:false}, never reaches the writer", async () => {
    const r = await def.execute(svc, { payload: { action: {} }, hostId: HOST });
    expect(r.ok).toBe(false);
    expect(mockHandler).not.toHaveBeenCalled();
  });
});
