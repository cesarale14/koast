import { isAirbnbConnectEnabled } from "../connect-flags";

describe("isAirbnbConnectEnabled", () => {
  const prev = process.env.KOAST_ENABLE_AIRBNB_CONNECT;
  afterEach(() => {
    if (prev === undefined) delete process.env.KOAST_ENABLE_AIRBNB_CONNECT;
    else process.env.KOAST_ENABLE_AIRBNB_CONNECT = prev;
  });

  it("defaults OFF (Airbnb connect deferred for v1)", () => {
    delete process.env.KOAST_ENABLE_AIRBNB_CONNECT;
    expect(isAirbnbConnectEnabled()).toBe(false);
  });

  it("off for any value other than the exact string 'true'", () => {
    process.env.KOAST_ENABLE_AIRBNB_CONNECT = "1";
    expect(isAirbnbConnectEnabled()).toBe(false);
    process.env.KOAST_ENABLE_AIRBNB_CONNECT = "TRUE";
    expect(isAirbnbConnectEnabled()).toBe(false);
  });

  it("on only when explicitly 'true'", () => {
    process.env.KOAST_ENABLE_AIRBNB_CONNECT = "true";
    expect(isAirbnbConnectEnabled()).toBe(true);
  });
});
