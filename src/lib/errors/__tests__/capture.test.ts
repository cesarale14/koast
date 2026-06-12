import { captureApiError } from "../capture";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeClient(count: number, inserts: any[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insert: async (row: any) => { inserts.push(row); return { error: null }; },
    select: () => chain,
    eq: () => chain,
    gte: async () => ({ count }),
  };
  return { from: () => chain };
}

describe("captureApiError (P6.4)", () => {
  test("inserts the error row", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inserts: any[] = [];
    await captureApiError(makeClient(1, inserts), { route: "/x", message: "boom", status: 500 });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ route: "/x", message: "boom", status: 500 });
  });

  test("logs CRITICAL when same-route errors hit the burst threshold", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await captureApiError(makeClient(5, []), { route: "/x", message: "boom" });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("CRITICAL"));
    spy.mockRestore();
  });

  test("no CRITICAL below the threshold", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await captureApiError(makeClient(2, []), { route: "/x", message: "boom" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("never throws even if the insert fails", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad: any = { from: () => ({ insert: async () => { throw new Error("db down"); } }) };
    await expect(captureApiError(bad, { route: "/x", message: "boom" })).resolves.toBeUndefined();
  });
});
