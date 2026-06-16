/**
 * getProPrice — derives the displayed Pro price straight from the Stripe
 * price object (operator msg 3730 pricing-integrity rule: the shown price
 * must equal the charged price, never a static string). The `stripe`
 * package is mocked so prices.retrieve returns a fixture; no real Stripe.
 */

const mockRetrieve = jest.fn();
const mockStripeCtor = jest.fn().mockImplementation(() => ({
  prices: { retrieve: mockRetrieve },
}));
jest.mock("stripe", () => ({ __esModule: true, default: mockStripeCtor }));

import { getProPrice } from "../stripe";

const OLD_ENV = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...OLD_ENV, STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PRO_PRICE_ID: "price_pro" };
});
afterAll(() => {
  process.env = OLD_ENV;
});

test("maps unit_amount / currency / interval from the Stripe price object", async () => {
  mockRetrieve.mockResolvedValueOnce({ unit_amount: 7900, currency: "usd", recurring: { interval: "month" } });
  await expect(getProPrice()).resolves.toEqual({ amountCents: 7900, currency: "usd", interval: "month" });
  expect(mockRetrieve).toHaveBeenCalledWith("price_pro");
});

test("reflects whatever the configured price charges (e.g. a $149 product)", async () => {
  // If the env points at the wrong product, the surface shows the truthful
  // (wrong) price — display can never silently diverge from the charge.
  mockRetrieve.mockResolvedValueOnce({ unit_amount: 14900, currency: "usd", recurring: { interval: "month" } });
  await expect(getProPrice()).resolves.toEqual({ amountCents: 14900, currency: "usd", interval: "month" });
});

test("null unit_amount → null (no price asserted)", async () => {
  mockRetrieve.mockResolvedValueOnce({ unit_amount: null, currency: "usd", recurring: { interval: "month" } });
  await expect(getProPrice()).resolves.toBeNull();
});

test("Stripe lookup throws → null (graceful, no thrown error)", async () => {
  mockRetrieve.mockRejectedValueOnce(new Error("No such price"));
  await expect(getProPrice()).resolves.toBeNull();
});

test("no price id configured → null, and Stripe is not queried", async () => {
  delete process.env.STRIPE_PRO_PRICE_ID;
  await expect(getProPrice()).resolves.toBeNull();
  expect(mockRetrieve).not.toHaveBeenCalled();
});

test("price with no recurring interval → one-time amount, interval null", async () => {
  mockRetrieve.mockResolvedValueOnce({ unit_amount: 7900, currency: "usd", recurring: null });
  await expect(getProPrice()).resolves.toEqual({ amountCents: 7900, currency: "usd", interval: null });
});
