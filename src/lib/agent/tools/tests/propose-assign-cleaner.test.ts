jest.mock("@/lib/supabase/service");
jest.mock("@/lib/proposals/server", () => ({
  ...jest.requireActual("@/lib/proposals/server"),
  createProposal: jest.fn(),
}));

import { proposeAssignCleanerTool } from "../propose-assign-cleaner";
import { createServiceClient } from "@/lib/supabase/service";
import { createProposal } from "@/lib/proposals/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CTX = { host: { id: "host-1" } } as any;
const mockCreate = createProposal as jest.MockedFunction<typeof createProposal>;

type Seed = Record<string, Record<string, unknown>[]>;
function fakeSvc(seed: Seed) {
  function from(table: string) {
    const result = { data: seed[table] ?? [], error: null };
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      limit: () => Promise.resolve(result),
      then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
    };
    return b;
  }
  return { from };
}

beforeEach(() => {
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreate.mockResolvedValue({ proposal: { id: "prop-1" } as any, autoExecuted: false });
});

describe("propose_assign_cleaner", () => {
  test("resolves references → creates an agent proposal with an id-lean block", async () => {
    (createServiceClient as jest.Mock).mockReturnValue(
      fakeSvc({
        properties: [{ id: "p1", name: "Villa Jamaica" }],
        cleaners: [{ id: "c1", name: "Karem Gutierrez" }],
        cleaning_tasks: [{ id: "t1", scheduled_date: "2026-06-12", status: "pending" }],
      }),
    );
    const out = await proposeAssignCleanerTool.handler(
      { property: "Villa", cleaner: "Karem", rationale: "free and closest" },
      CTX,
    );
    expect(out).toEqual({ created: true, proposal_id: "prop-1" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        hostId: "host-1",
        propertyId: "p1",
        actionType: "assign_cleaner",
        createdBy: "agent",
        rationale: "free and closest",
      }),
    );
    const payload = mockCreate.mock.calls[0][1].payload as {
      block: unknown;
      action: { taskId: string; cleanerId: string };
    };
    // ids live in action, NEVER in the display block.
    expect(payload.action).toEqual({ taskId: "t1", cleanerId: "c1" });
    expect(JSON.stringify(payload.block)).not.toContain("t1");
    expect(JSON.stringify(payload.block)).not.toContain("c1");
  });

  test("created:false (no execute) when the property can't be found", async () => {
    (createServiceClient as jest.Mock).mockReturnValue(fakeSvc({ properties: [] }));
    const out = await proposeAssignCleanerTool.handler(
      { property: "Nowhere", cleaner: "Karem", rationale: "x" },
      CTX,
    );
    expect(out.created).toBe(false);
    expect(out.reason).toMatch(/No property/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("created:false when the cleaner name is ambiguous", async () => {
    (createServiceClient as jest.Mock).mockReturnValue(
      fakeSvc({
        properties: [{ id: "p1", name: "Villa Jamaica" }],
        cleaners: [
          { id: "c1", name: "Karem A" },
          { id: "c2", name: "Karem B" },
        ],
      }),
    );
    const out = await proposeAssignCleanerTool.handler(
      { property: "Villa", cleaner: "Karem", rationale: "x" },
      CTX,
    );
    expect(out.created).toBe(false);
    expect(out.reason).toMatch(/more than one cleaner/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("created:false when there is no assignable turnover", async () => {
    (createServiceClient as jest.Mock).mockReturnValue(
      fakeSvc({
        properties: [{ id: "p1", name: "Villa Jamaica" }],
        cleaners: [{ id: "c1", name: "Karem Gutierrez" }],
        cleaning_tasks: [],
      }),
    );
    const out = await proposeAssignCleanerTool.handler(
      { property: "Villa", cleaner: "Karem", date: "2026-06-12", rationale: "x" },
      CTX,
    );
    expect(out.created).toBe(false);
    expect(out.reason).toMatch(/No assignable turnover/);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
