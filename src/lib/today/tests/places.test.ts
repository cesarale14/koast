import { toPlacesMap } from "@/lib/today/places";

describe("toPlacesMap — property → cover photo join", () => {
  it("maps name → cover_photo_url", () => {
    const m = toPlacesMap([
      { name: "Villa Jamaica", cover_photo_url: "https://x/villa.jpg" },
      { name: "Cozy Loft", cover_photo_url: "https://x/cozy.jpg" },
    ]);
    expect(m.get("Villa Jamaica")).toBe("https://x/villa.jpg");
    expect(m.get("Cozy Loft")).toBe("https://x/cozy.jpg");
    expect(m.size).toBe(2);
  });

  it("a property with no cover photo maps to null (graceful, not omitted)", () => {
    const m = toPlacesMap([{ name: "Bare Cabin", cover_photo_url: null }]);
    expect(m.has("Bare Cabin")).toBe(true);
    expect(m.get("Bare Cabin")).toBeNull();
  });

  it("skips a nameless row (can't key the join)", () => {
    const m = toPlacesMap([{ name: null, cover_photo_url: "https://x/orphan.jpg" }]);
    expect(m.size).toBe(0);
  });
});
