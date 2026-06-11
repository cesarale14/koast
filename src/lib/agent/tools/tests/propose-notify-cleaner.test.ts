/**
 * propose_notify_cleaner (P3.2) — proves the agent's re-notify proposal:
 * property resolution + refusal-over-guessing, the requirement that a turnover
 * be STAFFED (a cleaner already assigned), and the exact proposal it stores.
 * createProposal is mocked (its own lane suite covers it).
 */

jest.mock("@/lib/supabase/service");
jest.mock("@/lib/proposals/server");

import { proposeNotifyCleanerTool } from "../propose-notify-cleaner";
import { createServiceClient } from "@/lib/supabase/service";
import { createProposal } from "@/lib/proposals/server";

const mockCreate = createProposal as jest.MockedFunction<typeof createProposal>;
const HOST = "host-1";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { host: { id: HOST } } as any;

function tableBuilder(rows: unknown[]) {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    not: () => b,
    order: () => b,
    gte: () => b,
    limit: () => b,
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
  };
  return b;
}

function setSvc(opts: { properties?: unknown[]; tasks?: unknown[]; cleaners?: unknown[] }) {
  const svc = {
    from: (t: string) =>
      t === "properties"
        ? tableBuilder(opts.properties ?? [{ id: "p1", name: "Villa Jamaica", timezone: "America/New_York" }])
        : t === "cleaning_tasks"
          ? tableBuilder(opts.tasks ?? [])
          : t === "cleaners"
            ? tableBuilder(opts.cleaners ?? [{ name: "Karem" }])
            : tableBuilder([]),
  };
  (createServiceClient as jest.Mock).mockReturnValue(svc);
}

beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate.mockResolvedValue({ proposal: { id: "prop-xyz" } as any, autoExecuted: false });
});

test("no property match → created:false", async () => {
  setSvc({ properties: [{ id: "p1", name: "Villa Jamaica", timezone: null }] });
  const r = await proposeNotifyCleanerTool.handler({ property: "Beach House", rationale: "x" }, ctx);
  expect(r.created).toBe(false);
  expect(mockCreate).not.toHaveBeenCalled();
});

test("no staffed turnover → created:false (assign first)", async () => {
  setSvc({ tasks: [] });
  const r = await proposeNotifyCleanerTool.handler({ property: "Villa Jamaica", date: "2026-07-01", rationale: "x" }, ctx);
  expect(r.created).toBe(false);
  expect(r.reason).toMatch(/assign a cleaner first/);
});

test("staffed turnover → creates a notify_cleaner proposal with the assigned block", async () => {
  setSvc({
    tasks: [{ id: "task-9", scheduled_date: "2026-07-01", cleaner_id: "c1" }],
    cleaners: [{ name: "Karem Gutierrez" }],
  });
  const r = await proposeNotifyCleanerTool.handler({ property: "Villa Jamaica", rationale: "running late" }, ctx);
  expect(r.created).toBe(true);
  const arg = mockCreate.mock.calls[0][1];
  expect(arg.actionType).toBe("notify_cleaner");
  expect(arg.createdBy).toBe("agent");
  expect((arg.payload as { action: { taskId: string } }).action.taskId).toBe("task-9");
  const block = (arg.payload as { block: { kind: string; data: { status: string; cleanerName: string } } }).block;
  expect(block.kind).toBe("turnover");
  expect(block.data.status).toBe("assigned");
  expect(block.data.cleanerName).toBe("Karem Gutierrez");
});
