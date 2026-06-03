/**
 * places — the "places texture" for Today home: a property-name → cover-photo
 * lookup, joined onto the agenda payload (which references properties by
 * nickname). Pure mapping so it's unit-testable; cover_photo_url is the existing,
 * populated field (no new data). A property with no cover photo maps to null —
 * the component degrades gracefully (no broken <img>), it doesn't omit the place.
 */

export type Places = Map<string, string | null>; // property name → coverPhotoUrl | null

export function toPlacesMap(
  rows: { name: string | null; cover_photo_url: string | null }[],
): Places {
  const m: Places = new Map();
  for (const r of rows) {
    if (r.name) m.set(r.name, r.cover_photo_url ?? null);
  }
  return m;
}
