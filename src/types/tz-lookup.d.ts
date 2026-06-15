declare module "tz-lookup" {
  /**
   * Returns the IANA timezone name for a latitude/longitude (offline lookup).
   * Throws "invalid coordinates" for out-of-range input.
   */
  export default function tzlookup(lat: number, lon: number): string;
}
