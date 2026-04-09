import type { ICalBooking } from "./types";

const BLOCKED_SUMMARIES = [
  "not available", "blocked", "airbnb (not available)",
  "unavailable", "closed", "block", "closed - not available",
];

// "Reserved" on Airbnb = real booking (privacy-masked guest name)
// "Reserved" on other platforms = blocked date
const PLATFORM_BOOKING_SUMMARIES: Record<string, string[]> = {
  airbnb: ["reserved"],
};

function detectPlatform(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("airbnb.com")) return "airbnb";
  if (lower.includes("vrbo.com") || lower.includes("homeaway.com")) return "vrbo";
  if (lower.includes("booking.com")) return "booking_com";
  return "direct";
}

function parseDate(value: string): string {
  // Handle DTSTART;VALUE=DATE:20261201 or DTSTART:20261201T150000Z
  const dateStr = value.replace(/[^\d]/g, "").substring(0, 8);
  if (dateStr.length === 8) {
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
  }
  return value;
}

function unfold(icsText: string): string {
  // RFC 5545: line folding — lines starting with space or tab are continuations
  return icsText.replace(/\r?\n[ \t]/g, "");
}

export async function parseICalFeed(url: string): Promise<ICalBooking[]> {
  const res = await fetch(url, { headers: { "User-Agent": "StayCommand/1.0" } });
  if (!res.ok) {
    throw new Error(`Failed to fetch iCal feed: ${res.status} ${res.statusText}`);
  }

  const text = unfold(await res.text());
  const platform = detectPlatform(url);
  const bookings: ICalBooking[] = [];

  // Split into VEVENT blocks
  const eventBlocks = text.split("BEGIN:VEVENT");

  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i].split("END:VEVENT")[0];
    const lines = block.split(/\r?\n/);

    let uid = "";
    let summary = "";
    let dtstart = "";
    let dtend = "";
    let description = "";

    for (const line of lines) {
      if (line.startsWith("UID:")) uid = line.substring(4).trim();
      else if (line.startsWith("SUMMARY:")) summary = line.substring(8).trim();
      else if (line.startsWith("DTSTART")) {
        const val = line.split(":").slice(1).join(":");
        dtstart = parseDate(val.trim());
      } else if (line.startsWith("DTEND")) {
        const val = line.split(":").slice(1).join(":");
        dtend = parseDate(val.trim());
      } else if (line.startsWith("DESCRIPTION:")) {
        description = line.substring(12).trim();
      }
    }

    if (!dtstart || !dtend) continue;
    if (!uid) uid = `${platform}-${dtstart}-${dtend}-${summary}`;

    const lower = summary.toLowerCase();
    const platformBookings = PLATFORM_BOOKING_SUMMARIES[platform] ?? [];
    const isPlatformBooking = platformBookings.includes(lower);

    const isBlocked = !isPlatformBooking && (
      BLOCKED_SUMMARIES.some((b) => lower.includes(b))
      || summary === ""
    );

    // "Reserved" on Airbnb = booking with masked name
    const guestName = isBlocked ? null : (isPlatformBooking ? "Airbnb Guest" : summary || null);

    bookings.push({
      uid,
      guestName,
      checkIn: dtstart,
      checkOut: dtend,
      platform,
      isBlocked,
      description: description || null,
    });
  }

  return bookings;
}

export function validateICalUrl(text: string): boolean {
  return text.includes("BEGIN:VCALENDAR") && text.includes("BEGIN:VEVENT");
}
