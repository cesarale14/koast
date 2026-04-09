const cache = new Map<
  string,
  {
    name: string;
    shortName: string;
    photoUrl: string | null;
    location: string | null;
  }
>();

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (compatible; StayCommand/1.0)",
];

export async function fetchListingDetails(
  platform: string,
  listingId: string
): Promise<{
  name: string;
  shortName: string;
  photoUrl: string | null;
  location: string | null;
  success: boolean;
}> {
  const cacheKey = `${platform}:${listingId}`;
  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, success: true };

  if (platform === "airbnb") {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(
          `https://www.airbnb.com/rooms/${listingId}`,
          {
            headers: {
              "User-Agent": USER_AGENTS[attempt % USER_AGENTS.length],
            },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!res.ok) {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          }
          break;
        }
        const html = await res.text();

        const ogTitle =
          html.match(
            /<meta\s+property="og:title"\s+content="([^"]*)"/
          ) ??
          html.match(
            /<meta\s+content="([^"]*)"\s+property="og:title"/
          );
        const ogImage =
          html.match(
            /<meta\s+property="og:image"\s+content="([^"]*)"/
          ) ??
          html.match(
            /<meta\s+content="([^"]*)"\s+property="og:image"/
          );

        const fullName = ogTitle?.[1] ?? `Airbnb Listing ${listingId}`;
        const shortName = fullName.split("\u00b7")[0].trim();
        const photoUrl = ogImage?.[1] ?? null;

        const result = { name: fullName, shortName, photoUrl, location: null };
        cache.set(cacheKey, result);
        return { ...result, success: true };
      } catch {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  return {
    name: `Listing ${listingId}`,
    shortName: `Listing ${listingId}`,
    photoUrl: null,
    location: null,
    success: false,
  };
}
