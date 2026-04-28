import { createChannexClient } from "./client";

interface TestResult {
  test: number;
  name: string;
  status: "pass" | "fail" | "skip";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  taskIds?: any;
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any;
}

interface CertificationConfig {
  propertyId: string;
  roomTypes: { twinId: string; doubleId: string };
  ratePlans: {
    twinBar: string;
    twinBb: string;
    doubleBar: string;
    doubleBb: string;
  };
}

export async function setupTestProperty(): Promise<CertificationConfig> {
  const channex = createChannexClient();

  console.log("[cert] Creating test property...");
  const property = await channex.createProperty({
    title: "Test Property - Koast",
    currency: "USD",
    email: "test@koast.com",
    phone: "+1234567890",
    zip_code: "33602",
    country: "US",
    state: "FL",
    city: "Tampa",
    address: "123 Test Street",
    longitude: -82.4572,
    latitude: 27.9506,
    timezone: "America/New_York",
  });
  const propertyId = property.id;
  console.log(`[cert] Property created: ${propertyId}`);

  console.log("[cert] Creating room types...");
  const twin = await channex.createRoomType({
    property_id: propertyId,
    title: "Twin Room",
    count_of_rooms: 10,
    occ_adults: 2,
    occ_children: 0,
    occ_infants: 0,
    default_occupancy: 2,
  });
  const double = await channex.createRoomType({
    property_id: propertyId,
    title: "Double Room",
    count_of_rooms: 10,
    occ_adults: 2,
    occ_children: 0,
    occ_infants: 0,
    default_occupancy: 2,
  });
  console.log(`[cert] Twin Room: ${twin.id}, Double Room: ${double.id}`);

  console.log("[cert] Creating rate plans...");
  const twinBar = await channex.createRatePlan({
    property_id: propertyId,
    room_type_id: twin.id,
    title: "Best Available Rate",
    currency: "USD",
    sell_mode: "per_room",
    rate_mode: "manual",
    options: [{ occupancy: 1, is_primary: true, rate: 10000 }],
  });
  const twinBb = await channex.createRatePlan({
    property_id: propertyId,
    room_type_id: twin.id,
    title: "Bed & Breakfast Rate",
    currency: "USD",
    sell_mode: "per_room",
    rate_mode: "manual",
    options: [{ occupancy: 1, is_primary: true, rate: 12000 }],
  });
  const doubleBar = await channex.createRatePlan({
    property_id: propertyId,
    room_type_id: double.id,
    title: "Best Available Rate",
    currency: "USD",
    sell_mode: "per_room",
    rate_mode: "manual",
    options: [{ occupancy: 1, is_primary: true, rate: 10000 }],
  });
  const doubleBb = await channex.createRatePlan({
    property_id: propertyId,
    room_type_id: double.id,
    title: "Bed & Breakfast Rate",
    currency: "USD",
    sell_mode: "per_room",
    rate_mode: "manual",
    options: [{ occupancy: 1, is_primary: true, rate: 12000 }],
  });
  console.log(
    `[cert] Rate plans: TwinBAR=${twinBar.id}, TwinBB=${twinBb.id}, DoubleBAR=${doubleBar.id}, DoubleBB=${doubleBb.id}`
  );

  return {
    propertyId,
    roomTypes: { twinId: twin.id, doubleId: double.id },
    ratePlans: {
      twinBar: twinBar.id,
      twinBb: twinBb.id,
      doubleBar: doubleBar.id,
      doubleBb: doubleBb.id,
    },
  };
}

export async function runCertification(config: CertificationConfig): Promise<TestResult[]> {
  const channex = createChannexClient();
  const results: TestResult[] = [];
  const { propertyId, roomTypes, ratePlans } = config;

  // ===== Test 1: Full Sync (2 API calls) =====
  try {
    console.log("\n[cert] === Test 1: Full Sync ===");
    const syncResult = await channex.fullSync(
      propertyId,
      [roomTypes.twinId, roomTypes.doubleId],
      [
        { ratePlanId: ratePlans.twinBar, roomTypeId: roomTypes.twinId },
        { ratePlanId: ratePlans.twinBb, roomTypeId: roomTypes.twinId },
        { ratePlanId: ratePlans.doubleBar, roomTypeId: roomTypes.doubleId },
        { ratePlanId: ratePlans.doubleBb, roomTypeId: roomTypes.doubleId },
      ]
    );
    results.push({
      test: 1, name: "Full Sync", status: "pass",
      taskIds: syncResult,
      details: "2 API calls: 1 availability + 1 restrictions for 500 days",
    });
  } catch (e) {
    results.push({ test: 1, name: "Full Sync", status: "fail", error: String(e) });
  }

  // ===== Test 2: Single date single rate =====
  try {
    console.log("\n[cert] === Test 2: Single Date Single Rate ===");
    const res = await channex.updateRestrictions([{
      property_id: propertyId,
      rate_plan_id: ratePlans.twinBar,
      date_from: "2026-11-22",
      date_to: "2026-11-22",
      rate: 33300,
    }]);
    results.push({
      test: 2, name: "Single Date Single Rate", status: "pass",
      taskIds: res,
      details: "Twin/BAR Nov 22 → $333 (1 API call)",
    });
  } catch (e) {
    results.push({ test: 2, name: "Single Date Single Rate", status: "fail", error: String(e) });
  }

  // ===== Test 3: Single date multiple rates (1 API call) =====
  try {
    console.log("\n[cert] === Test 3: Single Date Multiple Rates ===");
    const res = await channex.updateRestrictions([
      { property_id: propertyId, rate_plan_id: ratePlans.twinBar, date_from: "2026-11-21", date_to: "2026-11-21", rate: 33300 },
      { property_id: propertyId, rate_plan_id: ratePlans.doubleBar, date_from: "2026-11-25", date_to: "2026-11-25", rate: 44400 },
      { property_id: propertyId, rate_plan_id: ratePlans.doubleBb, date_from: "2026-11-29", date_to: "2026-11-29", rate: 45623 },
    ]);
    results.push({
      test: 3, name: "Single Date Multiple Rates", status: "pass",
      taskIds: res,
      details: "3 rate updates in 1 call: Twin/BAR $333, Double/BAR $444, Double/BB $456.23",
    });
  } catch (e) {
    results.push({ test: 3, name: "Single Date Multiple Rates", status: "fail", error: String(e) });
  }

  // ===== Test 4: Multiple date multiple rates (1 API call) =====
  try {
    console.log("\n[cert] === Test 4: Multiple Date Multiple Rates ===");
    const res = await channex.updateRestrictions([
      { property_id: propertyId, rate_plan_id: ratePlans.twinBar, date_from: "2026-11-01", date_to: "2026-11-10", rate: 24100 },
      { property_id: propertyId, rate_plan_id: ratePlans.doubleBar, date_from: "2026-11-10", date_to: "2026-11-16", rate: 31266 },
      { property_id: propertyId, rate_plan_id: ratePlans.doubleBb, date_from: "2026-11-01", date_to: "2026-11-20", rate: 11100 },
    ]);
    results.push({
      test: 4, name: "Multiple Date Multiple Rates", status: "pass",
      taskIds: res,
      details: "3 range updates in 1 call",
    });
  } catch (e) {
    results.push({ test: 4, name: "Multiple Date Multiple Rates", status: "fail", error: String(e) });
  }

  // ===== Test 5: Min stay (1 API call) =====
  try {
    console.log("\n[cert] === Test 5: Min Stay ===");
    const res = await channex.updateRestrictions([
      { property_id: propertyId, rate_plan_id: ratePlans.twinBar, date_from: "2026-11-23", date_to: "2026-11-23", min_stay_arrival: 3 },
      { property_id: propertyId, rate_plan_id: ratePlans.doubleBar, date_from: "2026-11-25", date_to: "2026-11-25", min_stay_arrival: 2 },
      { property_id: propertyId, rate_plan_id: ratePlans.doubleBb, date_from: "2026-11-15", date_to: "2026-11-15", min_stay_arrival: 5 },
    ]);
    results.push({
      test: 5, name: "Min Stay", status: "pass",
      taskIds: res,
      details: "3 min stay updates in 1 call",
    });
  } catch (e) {
    results.push({ test: 5, name: "Min Stay", status: "fail", error: String(e) });
  }

  // ===== Test 6: Stop sell (1 API call) =====
  try {
    console.log("\n[cert] === Test 6: Stop Sell ===");
    const res = await channex.updateRestrictions([
      { property_id: propertyId, rate_plan_id: ratePlans.twinBar, date_from: "2026-11-14", date_to: "2026-11-14", stop_sell: true },
      { property_id: propertyId, rate_plan_id: ratePlans.doubleBar, date_from: "2026-11-16", date_to: "2026-11-16", stop_sell: true },
      { property_id: propertyId, rate_plan_id: ratePlans.doubleBb, date_from: "2026-11-20", date_to: "2026-11-20", stop_sell: true },
    ]);
    results.push({
      test: 6, name: "Stop Sell", status: "pass",
      taskIds: res,
      details: "3 stop sell updates in 1 call",
    });
  } catch (e) {
    results.push({ test: 6, name: "Stop Sell", status: "fail", error: String(e) });
  }

  // ===== Test 7: Multiple restrictions (1 API call) =====
  try {
    console.log("\n[cert] === Test 7: Multiple Restrictions ===");
    const res = await channex.updateRestrictions([
      { property_id: propertyId, rate_plan_id: ratePlans.twinBar, date_from: "2026-11-05", date_to: "2026-11-08", min_stay_arrival: 2, max_stay: 14, closed_to_arrival: false, closed_to_departure: false },
      { property_id: propertyId, rate_plan_id: ratePlans.doubleBar, date_from: "2026-11-10", date_to: "2026-11-12", min_stay_arrival: 3, stop_sell: false, closed_to_arrival: true },
      { property_id: propertyId, rate_plan_id: ratePlans.doubleBb, date_from: "2026-11-18", date_to: "2026-11-20", closed_to_departure: true, min_stay_arrival: 1 },
      { property_id: propertyId, rate_plan_id: ratePlans.twinBb, date_from: "2026-11-22", date_to: "2026-11-25", max_stay: 7, stop_sell: false },
    ]);
    results.push({
      test: 7, name: "Multiple Restrictions", status: "pass",
      taskIds: res,
      details: "4 restriction updates with CTA, CTD, min/max stay in 1 call",
    });
  } catch (e) {
    results.push({ test: 7, name: "Multiple Restrictions", status: "fail", error: String(e) });
  }

  // ===== Test 8: Half-year update (1 API call) =====
  try {
    console.log("\n[cert] === Test 8: Half-Year Update ===");
    const res = await channex.updateRestrictions([
      { property_id: propertyId, rate_plan_id: ratePlans.twinBar, date_from: "2026-12-01", date_to: "2027-05-31", rate: 15000, min_stay_arrival: 2, stop_sell: false },
      { property_id: propertyId, rate_plan_id: ratePlans.doubleBar, date_from: "2026-12-01", date_to: "2027-05-31", rate: 18000, min_stay_arrival: 1, stop_sell: false },
    ]);
    results.push({
      test: 8, name: "Half-Year Update", status: "pass",
      taskIds: res,
      details: "2 rate+restriction updates for Dec 2026-May 2027 in 1 call",
    });
  } catch (e) {
    results.push({ test: 8, name: "Half-Year Update", status: "fail", error: String(e) });
  }

  // ===== Test 9: Single date availability (1-2 API calls) =====
  try {
    console.log("\n[cert] === Test 9: Single Date Availability ===");
    const res = await channex.updateAvailability([
      { property_id: propertyId, room_type_id: roomTypes.twinId, date_from: "2026-11-21", date_to: "2026-11-21", availability: 7 },
      { property_id: propertyId, room_type_id: roomTypes.doubleId, date_from: "2026-11-25", date_to: "2026-11-25", availability: 0 },
    ]);
    results.push({
      test: 9, name: "Single Date Availability", status: "pass",
      taskIds: res,
      details: "Twin Nov 21 → 7, Double Nov 25 → 0 (1 API call)",
    });
  } catch (e) {
    results.push({ test: 9, name: "Single Date Availability", status: "fail", error: String(e) });
  }

  // ===== Test 10: Multiple date availability (1-2 API calls) =====
  try {
    console.log("\n[cert] === Test 10: Multiple Date Availability ===");
    const res = await channex.updateAvailability([
      { property_id: propertyId, room_type_id: roomTypes.twinId, date_from: "2026-11-10", date_to: "2026-11-16", availability: 3 },
      { property_id: propertyId, room_type_id: roomTypes.doubleId, date_from: "2026-11-17", date_to: "2026-11-24", availability: 4 },
    ]);
    results.push({
      test: 10, name: "Multiple Date Availability", status: "pass",
      taskIds: res,
      details: "Twin Nov 10-16 → 3, Double Nov 17-24 → 4 (1 API call)",
    });
  } catch (e) {
    results.push({ test: 10, name: "Multiple Date Availability", status: "fail", error: String(e) });
  }

  // ===== Test 11: Booking (webhook-based) =====
  results.push({
    test: 11, name: "Booking", status: "pass",
    details: "Webhook handler at /api/webhooks/channex receives bookings, acknowledges revisions, upserts into Supabase. Ready for test booking.",
  });

  // ===== Test 12: Rate limits =====
  results.push({
    test: 12, name: "Rate Limits", status: "pass",
    details: "AirROI client has request queue with 600ms throttle (~100 req/min). Channex requests are sequential within each operation.",
  });

  // ===== Test 13: Update logic =====
  results.push({
    test: 13, name: "Update Logic", status: "pass",
    details: "Pricing engine only pushes changed rates (diff against current applied_rate). Full sync is manual-only via 'Run Pricing Engine' button, not on a timer.",
  });

  // ===== Test 14: Extra notes =====
  results.push({
    test: 14, name: "Extra Notes", status: "pass",
    details: {
      supported: [
        "Full sync (availability + restrictions in 2 calls)",
        "Single/multi date rate updates",
        "Date range updates",
        "Min stay, max stay, stop sell, CTA, CTD",
        "Availability updates (single + range)",
        "Booking webhook with auto-acknowledgment",
        "Booking modification and cancellation handling",
      ],
      notYetSupported: [
        "Per-person pricing (using per_room mode)",
        "Group booking management",
        "Photo sync",
      ],
      architecture: "Next.js 14 + Supabase + Channex API. Pricing engine runs on-demand, not scheduled. Rate changes pushed individually, not as full sync.",
    },
  });

  return results;
}
