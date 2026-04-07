/**
 * One-time migration: Villa Jamaica from Channex staging → production.
 *
 * Usage:
 *   DRY_RUN=true  npx tsx scripts/migrate-channex-production.ts   # preview (default)
 *   DRY_RUN=false npx tsx scripts/migrate-channex-production.ts   # execute
 *
 * Requires .env.local sourced: set -a && source .env.local && set +a
 * Plus CHANNEX_PROD_KEY env var for the production API key.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DRY_RUN = process.env.DRY_RUN !== "false";

const STAGING_URL = "https://staging.channex.io/api/v1";
const PROD_URL = "https://app.channex.io/api/v1";

const STAGING_KEY = process.env.CHANNEX_API_KEY!;
const PROD_KEY = process.env.CHANNEX_PROD_KEY!;

const VILLA_JAMAICA_DB_ID = "9a564a82-2677-4931-bcea-30976d958121";
const STAGING_PROP_ID = "cf4a8bc4-956a-4c89-a40a-14c2e56ebd96";

if (!STAGING_KEY) { console.error("Missing CHANNEX_API_KEY (staging)"); process.exit(1); }
if (!PROD_KEY) { console.error("Missing CHANNEX_PROD_KEY (production)"); process.exit(1); }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) { console.log(`[migrate] ${msg}`); }
function logDry(msg: string) { console.log(`[DRY RUN] ${msg}`); }
function logOk(msg: string) { console.log(`  ✓ ${msg}`); }
function logErr(msg: string) { console.error(`  ✗ ${msg}`); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function channexGet(baseUrl: string, apiKey: string, endpoint: string): Promise<any> {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${endpoint} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function channexPost(baseUrl: string, apiKey: string, endpoint: string, body: any): Promise<any> {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "user-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${endpoint} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Step 1: Read staging data
// ---------------------------------------------------------------------------

async function readStaging() {
  log("Step 1: Reading staging data...");

  const propRes = await channexGet(STAGING_URL, STAGING_KEY, `/properties/${STAGING_PROP_ID}`);
  const prop = propRes.data;
  logOk(`Property: "${prop.attributes.title}" (${prop.id})`);

  const rtRes = await channexGet(STAGING_URL, STAGING_KEY, `/room_types?filter[property_id]=${STAGING_PROP_ID}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomTypes = rtRes.data as any[];
  for (const rt of roomTypes) {
    logOk(`Room Type: "${rt.attributes.title}" (${rt.id}) — ${rt.attributes.occ_adults} adults, ${rt.attributes.count_of_rooms} rooms`);
  }

  const rpRes = await channexGet(STAGING_URL, STAGING_KEY, `/rate_plans?filter[property_id]=${STAGING_PROP_ID}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ratePlans = rpRes.data as any[];
  for (const rp of ratePlans) {
    const rtId = rp.relationships?.room_type?.data?.id;
    const rtName = roomTypes.find((r) => r.id === rtId)?.attributes.title ?? "?";
    logOk(`Rate Plan: "${rp.attributes.title}" → ${rtName} (${rp.id})`);
  }

  return { prop, roomTypes, ratePlans };
}

// ---------------------------------------------------------------------------
// Step 2: Create on production
// ---------------------------------------------------------------------------

interface IdMapping {
  property: { staging: string; production: string };
  roomTypes: { staging: string; production: string; title: string }[];
  ratePlans: { staging: string; production: string; title: string; stagingRoomTypeId: string; prodRoomTypeId: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createOnProduction(prop: any, roomTypes: any[], ratePlans: any[]): Promise<IdMapping> {
  log("Step 2: Creating on production...");

  const mapping: IdMapping = {
    property: { staging: STAGING_PROP_ID, production: "" },
    roomTypes: [],
    ratePlans: [],
  };

  // --- Create property ---
  const propAttrs = prop.attributes;
  const propertyPayload = {
    property: {
      title: propAttrs.title,
      currency: propAttrs.currency,
      email: propAttrs.email,
      phone: propAttrs.phone,
      zip_code: propAttrs.zip_code,
      country: propAttrs.country,
      state: propAttrs.state,
      city: propAttrs.city,
      address: propAttrs.address,
      longitude: parseFloat(propAttrs.longitude),
      latitude: parseFloat(propAttrs.latitude),
      timezone: propAttrs.timezone,
      property_type: propAttrs.property_type ?? "apartment",
      content: {
        description: propAttrs.content?.description ?? "",
      },
      settings: {
        min_stay_type: propAttrs.settings?.min_stay_type ?? "both",
        allow_availability_autoupdate: false,
        allow_availability_autoupdate_on_cancellation: false,
        allow_availability_autoupdate_on_confirmation: true,
        allow_availability_autoupdate_on_modification: false,
        state_length: 500,
      },
    },
  };

  if (DRY_RUN) {
    logDry(`Would create property: "${propAttrs.title}"`);
    logDry(`  Payload: ${JSON.stringify(propertyPayload).slice(0, 300)}...`);
    mapping.property.production = "DRY_RUN_PROP_ID";
  } else {
    const res = await channexPost(PROD_URL, PROD_KEY, "/properties", propertyPayload);
    const newId = res.data?.id;
    if (!newId) throw new Error("Property creation failed: no ID returned");
    mapping.property.production = newId;
    logOk(`Property created: ${newId}`);
  }

  // --- Create room types ---
  // Sort by position to maintain order
  const sortedRTs = [...roomTypes].sort((a, b) => (a.attributes.position ?? 0) - (b.attributes.position ?? 0));

  for (const rt of sortedRTs) {
    const rtAttrs = rt.attributes;
    const roomTypePayload = {
      room_type: {
        property_id: mapping.property.production,
        title: rtAttrs.title,
        count_of_rooms: rtAttrs.count_of_rooms ?? 1,
        occ_adults: rtAttrs.occ_adults ?? 8,
        occ_children: rtAttrs.occ_children ?? 2,
        occ_infants: rtAttrs.occ_infants ?? 1,
        default_occupancy: rtAttrs.default_occupancy ?? 6,
        room_kind: rtAttrs.room_kind ?? "room",
      },
    };

    if (DRY_RUN) {
      logDry(`Would create room type: "${rtAttrs.title}" (occ_adults=${rtAttrs.occ_adults}, default_occ=${rtAttrs.default_occupancy})`);
      mapping.roomTypes.push({ staging: rt.id, production: `DRY_RUN_RT_${rt.id.slice(0, 8)}`, title: rtAttrs.title });
    } else {
      const res = await channexPost(PROD_URL, PROD_KEY, "/room_types", roomTypePayload);
      const newId = res.data?.id;
      if (!newId) throw new Error(`Room type creation failed for "${rtAttrs.title}": no ID returned`);
      mapping.roomTypes.push({ staging: rt.id, production: newId, title: rtAttrs.title });
      logOk(`Room type created: "${rtAttrs.title}" → ${newId}`);
    }
  }

  // --- Create rate plans ---
  // Build staging→prod room type ID map
  const rtIdMap: Record<string, string> = {};
  for (const m of mapping.roomTypes) {
    rtIdMap[m.staging] = m.production;
  }

  for (const rp of ratePlans) {
    const rpAttrs = rp.attributes;
    const stagingRtId = rp.relationships?.room_type?.data?.id ?? "";
    const prodRtId = rtIdMap[stagingRtId];
    if (!prodRtId) {
      logErr(`No prod room type mapping for staging ${stagingRtId}, skipping rate plan "${rpAttrs.title}"`);
      continue;
    }

    // Build options from staging data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options = (rpAttrs.options ?? []).map((opt: any) => ({
      occupancy: opt.occupancy,
      is_primary: opt.is_primary,
      rate: opt.rate,
    }));
    if (options.length === 0) {
      options.push({ occupancy: 1, is_primary: true, rate: "165.00" });
    }

    const ratePlanPayload = {
      rate_plan: {
        property_id: mapping.property.production,
        room_type_id: prodRtId,
        title: rpAttrs.title,
        currency: rpAttrs.currency ?? "USD",
        sell_mode: rpAttrs.sell_mode ?? "per_room",
        rate_mode: rpAttrs.rate_mode ?? "manual",
        meal_type: rpAttrs.meal_type ?? "none",
        children_fee: rpAttrs.children_fee ?? "0.00",
        infant_fee: rpAttrs.infant_fee ?? "0.00",
        options,
      },
    };

    if (DRY_RUN) {
      logDry(`Would create rate plan: "${rpAttrs.title}" → room_type ${prodRtId}`);
      logDry(`  Options: ${JSON.stringify(options)}`);
      mapping.ratePlans.push({
        staging: rp.id, production: `DRY_RUN_RP_${rp.id.slice(0, 8)}`,
        title: rpAttrs.title, stagingRoomTypeId: stagingRtId, prodRoomTypeId: prodRtId,
      });
    } else {
      const res = await channexPost(PROD_URL, PROD_KEY, "/rate_plans", ratePlanPayload);
      const newId = res.data?.id;
      if (!newId) throw new Error(`Rate plan creation failed for "${rpAttrs.title}": no ID returned`);
      mapping.ratePlans.push({
        staging: rp.id, production: newId,
        title: rpAttrs.title, stagingRoomTypeId: stagingRtId, prodRoomTypeId: prodRtId,
      });
      logOk(`Rate plan created: "${rpAttrs.title}" → ${newId}`);
    }
  }

  return mapping;
}

// ---------------------------------------------------------------------------
// Step 3: Output mapping
// ---------------------------------------------------------------------------

function outputMapping(mapping: IdMapping) {
  log("Step 3: ID Mapping (staging → production)");
  console.log("\n" + "=".repeat(70));
  console.log("PROPERTY:");
  console.log(`  ${mapping.property.staging} → ${mapping.property.production}`);
  console.log("\nROOM TYPES:");
  for (const rt of mapping.roomTypes) {
    console.log(`  ${rt.title}: ${rt.staging} → ${rt.production}`);
  }
  console.log("\nRATE PLANS:");
  for (const rp of mapping.ratePlans) {
    console.log(`  ${rp.title} (${rp.stagingRoomTypeId.slice(0, 8)}→${rp.prodRoomTypeId.slice(0, 8)}): ${rp.staging} → ${rp.production}`);
  }
  console.log("=".repeat(70) + "\n");
}

// ---------------------------------------------------------------------------
// Step 4: Update database
// ---------------------------------------------------------------------------

async function updateDatabase(mapping: IdMapping) {
  log("Step 4: Updating database...");

  // Dynamic import to avoid requiring supabase setup for dry runs
  const { createServiceClient } = await import("../src/lib/supabase/service");
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  if (DRY_RUN) {
    logDry(`Would update properties.channex_property_id: ${STAGING_PROP_ID} → ${mapping.property.production}`);
    logDry(`Would delete + insert ${mapping.roomTypes.length} channex_room_types`);
    logDry(`Would delete + insert ${mapping.ratePlans.length} channex_rate_plans`);
    return;
  }

  // Update property's channex_property_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: propErr } = await (supabase.from("properties") as any)
    .update({ channex_property_id: mapping.property.production })
    .eq("id", VILLA_JAMAICA_DB_ID);
  if (propErr) throw new Error(`Failed to update property: ${propErr.message}`);
  logOk(`Updated properties.channex_property_id → ${mapping.property.production}`);

  // Replace room types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("channex_room_types") as any).delete().eq("property_id", VILLA_JAMAICA_DB_ID);
  const rtRows = mapping.roomTypes.map((rt) => ({
    id: rt.production,
    property_id: VILLA_JAMAICA_DB_ID,
    channex_property_id: mapping.property.production,
    title: rt.title,
    count_of_rooms: 1,
    occ_adults: 8,
    occ_children: 2,
    cached_at: now,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rtErr } = await (supabase.from("channex_room_types") as any).insert(rtRows);
  if (rtErr) throw new Error(`Failed to insert room types: ${rtErr.message}`);
  logOk(`Inserted ${rtRows.length} channex_room_types`);

  // Replace rate plans
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("channex_rate_plans") as any).delete().eq("property_id", VILLA_JAMAICA_DB_ID);
  const rpRows = mapping.ratePlans.map((rp) => ({
    id: rp.production,
    property_id: VILLA_JAMAICA_DB_ID,
    room_type_id: rp.prodRoomTypeId,
    title: rp.title,
    sell_mode: "per_room",
    currency: "USD",
    rate_mode: "manual",
    cached_at: now,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpErr } = await (supabase.from("channex_rate_plans") as any).insert(rpRows);
  if (rpErr) throw new Error(`Failed to insert rate plans: ${rpErr.message}`);
  logOk(`Inserted ${rpRows.length} channex_rate_plans`);

  // Clear property_channels (fresh start on production)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("property_channels") as any).delete().eq("property_id", VILLA_JAMAICA_DB_ID);
  logOk("Cleared property_channels for fresh start");
}

// ---------------------------------------------------------------------------
// Step 5: Verify production
// ---------------------------------------------------------------------------

async function verifyProduction(mapping: IdMapping) {
  log("Step 5: Verifying production...");

  if (DRY_RUN) {
    logDry("Would verify property, room types, and rate plans on production");
    return;
  }

  // Verify property
  const propRes = await channexGet(PROD_URL, PROD_KEY, `/properties/${mapping.property.production}`);
  const propTitle = propRes.data?.attributes?.title;
  if (propTitle) {
    logOk(`Property verified: "${propTitle}" (${mapping.property.production})`);
  } else {
    logErr("Property verification failed");
  }

  // Verify room types
  const rtRes = await channexGet(PROD_URL, PROD_KEY, `/room_types?filter[property_id]=${mapping.property.production}`);
  const prodRTs = rtRes.data ?? [];
  logOk(`Room types on production: ${prodRTs.length} (expected ${mapping.roomTypes.length})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const rt of prodRTs as any[]) {
    logOk(`  "${rt.attributes.title}" (${rt.id})`);
  }

  // Verify rate plans
  const rpRes = await channexGet(PROD_URL, PROD_KEY, `/rate_plans?filter[property_id]=${mapping.property.production}`);
  const prodRPs = rpRes.data ?? [];
  logOk(`Rate plans on production: ${prodRPs.length} (expected ${mapping.ratePlans.length})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const rp of prodRPs as any[]) {
    const rtId = rp.relationships?.room_type?.data?.id;
    logOk(`  "${rp.attributes.title}" → room_type ${rtId?.slice(0, 8)} (${rp.id})`);
  }

  // Verify database
  const { createServiceClient } = await import("../src/lib/supabase/service");
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dbProp } = await (supabase.from("properties") as any)
    .select("channex_property_id")
    .eq("id", VILLA_JAMAICA_DB_ID)
    .limit(1);
  const dbChannexId = dbProp?.[0]?.channex_property_id;
  if (dbChannexId === mapping.property.production) {
    logOk(`Database channex_property_id matches: ${dbChannexId}`);
  } else {
    logErr(`Database mismatch: ${dbChannexId} (expected ${mapping.property.production})`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log(`  CHANNEX MIGRATION: STAGING → PRODUCTION`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no production writes)" : "LIVE EXECUTION"}`);
  console.log(`  Property: Villa Jamaica (${VILLA_JAMAICA_DB_ID})`);
  console.log(`  Staging: ${STAGING_URL} (key: ${STAGING_KEY.slice(0, 8)}...)`);
  console.log(`  Production: ${PROD_URL} (key: ${PROD_KEY.slice(0, 8)}...)`);
  console.log("=".repeat(70) + "\n");

  // Step 1: Read staging
  const { prop, roomTypes, ratePlans } = await readStaging();

  // Step 2: Create on production
  const mapping = await createOnProduction(prop, roomTypes, ratePlans);

  // Step 3: Output mapping
  outputMapping(mapping);

  // Step 4: Update database
  await updateDatabase(mapping);

  // Step 5: Verify
  await verifyProduction(mapping);

  console.log("\n" + "=".repeat(70));
  if (DRY_RUN) {
    console.log("  DRY RUN COMPLETE — review output above.");
    console.log("  To execute: DRY_RUN=false CHANNEX_PROD_KEY=... npx tsx scripts/migrate-channex-production.ts");
  } else {
    console.log("  MIGRATION COMPLETE");
    console.log("  Next steps:");
    console.log("  1. Update CHANNEX_API_KEY in .env.local and Vercel to the production key");
    console.log("  2. Update CHANNEX_API_URL to https://app.channex.io/api/v1 (or remove to use default)");
    console.log("  3. Update staycommand-workers/.env with production key and URL");
    console.log("  4. Run full sync: POST /api/channex/certification-runner { test: 1 }");
    console.log("  5. Set up webhook on production Channex pointing to your webhook URL");
  }
  console.log("=".repeat(70) + "\n");
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
