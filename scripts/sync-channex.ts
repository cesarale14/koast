/**
 * sync-channex.ts — periodic Channex booking sync runner for the VPS.
 *
 * Designed to be called on a cron / systemd timer every 15 minutes as a
 * safety net for webhook misses. Talks to the Channex API directly and
 * writes directly to Postgres via `postgres`, so it doesn't depend on
 * the Next.js runtime being up.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/sync-channex.ts
 *
 * Example cron entry (every 15 min):
 *   STAR/15 * * * * cd /home/ubuntu/staycommand && set -a && source .env.local && set +a && npx tsx scripts/sync-channex.ts >> /var/log/staycommand/sync-channex.log 2>&1
 */

import postgres from "postgres";

const CHANNEX_API_URL = process.env.CHANNEX_API_URL ?? "https://app.channex.io/api/v1";
const CHANNEX_API_KEY = process.env.CHANNEX_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!CHANNEX_API_KEY) { console.error("CHANNEX_API_KEY not set"); process.exit(1); }
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function channexGet(path: string): Promise<any> {
  const res = await fetch(`${CHANNEX_API_URL}${path}`, {
    headers: { "user-api-key": CHANNEX_API_KEY!, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function detectPlatform(otaName: string | null | undefined, uniqueId: string | null | undefined): string {
  const uid = (uniqueId ?? "").toUpperCase();
  if (uid.startsWith("BDC-")) return "booking_com";
  if (uid.startsWith("ABB-")) return "airbnb";
  if (uid.startsWith("VRBO-") || uid.startsWith("HA-")) return "vrbo";
  const n = (otaName ?? "").toLowerCase();
  if (n.includes("airbnb")) return "airbnb";
  if (n.includes("vrbo") || n.includes("homeaway")) return "vrbo";
  if (n.includes("booking")) return "booking_com";
  return "direct";
}

function log(msg: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function main() {
  const startedAt = new Date().toISOString();
  log(`sync-channex start`);

  const sql = postgres(DATABASE_URL!, { max: 1, prepare: false });

  try {
    const properties = await sql<{ id: string; name: string; channex_property_id: string }[]>`
      SELECT id, name, channex_property_id
      FROM properties
      WHERE channex_property_id IS NOT NULL
    `;

    if (properties.length === 0) {
      log("no Channex-mapped properties; nothing to do");
      return;
    }

    let checked = 0;
    let inserted = 0;
    let updated = 0;
    let cancelled = 0;

    for (const prop of properties) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allBookings: any[] = [];
        let page = 1;
        while (true) {
          const res = await channexGet(
            `/bookings?filter%5Bproperty_id%5D=${prop.channex_property_id}&pagination%5Bpage%5D=${page}&pagination%5Blimit%5D=100`
          );
          const data = (res.data ?? []) as unknown[];
          allBookings.push(...data);
          const total = res?.meta?.total ?? allBookings.length;
          if (allBookings.length >= total || data.length === 0) break;
          page++;
        }

        checked += allBookings.length;

        for (const b of allBookings) {
          const ba = b.attributes;
          const bookingId: string = b.id;
          const customer = ba.customer ?? {};
          const guestName = [customer.name, customer.surname].filter(Boolean).join(" ") || null;
          const platform = detectPlatform(ba.ota_name, ba.unique_id ?? ba.ota_reservation_code);
          const isCancelled = ba.status === "cancelled";
          const status = isCancelled ? "cancelled" : "confirmed";
          const price = ba.amount ? parseFloat(ba.amount) : null;

          const existing = await sql<{ id: string; status: string }[]>`
            SELECT id, status FROM bookings WHERE channex_booking_id = ${bookingId} LIMIT 1
          `;

          if (existing.length > 0) {
            const row = existing[0];
            const wasConfirmed = row.status === "confirmed";
            await sql`
              UPDATE bookings SET
                property_id = ${prop.id},
                platform = ${platform},
                guest_name = ${guestName},
                guest_email = ${customer.mail ?? null},
                guest_phone = ${customer.phone ?? null},
                check_in = ${ba.arrival_date},
                check_out = ${ba.departure_date},
                total_price = ${price},
                currency = ${ba.currency ?? "USD"},
                status = ${status},
                platform_booking_id = ${ba.ota_reservation_code ?? null},
                notes = ${ba.notes ?? null},
                updated_at = now()
              WHERE id = ${row.id}
            `;
            updated++;
            if (isCancelled && wasConfirmed) cancelled++;
          } else if (!isCancelled) {
            await sql`
              INSERT INTO bookings (
                property_id, platform, channex_booking_id, guest_name, guest_email, guest_phone,
                check_in, check_out, total_price, currency, status, platform_booking_id, notes
              ) VALUES (
                ${prop.id}, ${platform}, ${bookingId}, ${guestName},
                ${customer.mail ?? null}, ${customer.phone ?? null},
                ${ba.arrival_date}, ${ba.departure_date}, ${price}, ${ba.currency ?? "USD"},
                ${status}, ${ba.ota_reservation_code ?? null}, ${ba.notes ?? null}
              )
            `;
            inserted++;
          }
        }

        log(`${prop.name}: fetched=${allBookings.length}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`${prop.name}: ERROR ${msg}`);
      }
    }

    log(`sync-channex done started_at=${startedAt} checked=${checked} inserted=${inserted} updated=${updated} cancelled=${cancelled}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[sync-channex] fatal:", err);
  process.exit(1);
});
