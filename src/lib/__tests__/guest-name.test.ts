import { resolveDisplayGuestName } from "@/lib/guest-name";

describe("resolveDisplayGuestName", () => {
  test("returns the booking guest_name when it's a real name", () => {
    expect(
      resolveDisplayGuestName({
        bookingGuestName: "Hiria Puha",
        channexGuestName: null,
        platform: "booking_com",
      }),
    ).toBe("Hiria Puha");
  });

  test("ignores the iCal Airbnb sentinel and falls back to the platform tag", () => {
    expect(
      resolveDisplayGuestName({
        bookingGuestName: "Airbnb Guest",
        channexGuestName: null,
        platform: "airbnb",
      }),
    ).toBe("Airbnb Guest");
  });

  test("falls back to platform tag when bookingGuestName is null", () => {
    expect(
      resolveDisplayGuestName({
        bookingGuestName: null,
        channexGuestName: null,
        platform: "booking_com",
      }),
    ).toBe("Booking.com guest");
  });

  test("trims whitespace and treats whitespace-only as empty", () => {
    expect(
      resolveDisplayGuestName({
        bookingGuestName: "  ",
        channexGuestName: null,
        platform: "vrbo",
      }),
    ).toBe("Vrbo guest");

    expect(
      resolveDisplayGuestName({
        bookingGuestName: "  Bettina Böckels  ",
        channexGuestName: null,
        platform: "booking_com",
      }),
    ).toBe("Bettina Böckels");
  });

  test("unknown platform falls back to plain Guest", () => {
    expect(
      resolveDisplayGuestName({
        bookingGuestName: null,
        channexGuestName: null,
        platform: null,
      }),
    ).toBe("Guest");
  });
});
