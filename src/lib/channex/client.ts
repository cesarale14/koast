import type {
  ChannexResponse,
  ChannexProperty,
  ChannexRoomType,
  ChannexBooking,
  ChannexEntity,
  ChannexAvailabilityAttrs,
  ChannexRestrictionAttrs,
} from "./types";

// Session 6 — Channex Reviews entity shape. Derived from live-probe
// data against Villa Jamaica. Airbnb reviews populate `scores` (per-
// category breakdown) + `raw_content.{public_review,private_feedback}`;
// BDC reviews use the same outer envelope but may omit private_feedback
// and use a different `scores` category set.
export interface ChannexReviewAttrs {
  id: string;
  ota: string;                            // "AirBNB" / "BookingCom" / "Expedia"
  ota_reservation_id: string | null;
  received_at: string | null;             // ISO timestamp
  inserted_at: string | null;             // ISO timestamp
  updated_at: string | null;
  expired_at: string | null;              // reply deadline
  is_hidden: boolean;
  is_replied: boolean;
  is_expired: boolean;
  guest_name: string | null;
  overall_score: number | null;           // 0-10 scale on Airbnb
  content: string | null;                 // concatenated public + private
  raw_content?: {
    public_review?: string | null;
    private_feedback?: string | null;
  } | null;
  scores?: Array<{ category: string; score: number }> | null;
  reply?: Record<string, unknown> | null;
  tags?: string[] | null;
  meta?: Record<string, unknown> | null;
}

// `attributes.id` is always the review's canonical UUID, so the
// flattened ChannexReview is just the attributes themselves.
export type ChannexReview = ChannexReviewAttrs;

const DEFAULT_BASE_URL = "https://app.channex.io/api/v1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResponse = any;

// ==================== Guest Review (Session 6.2) ====================

// Outgoing host-review-of-guest categories. Per the Channex docs payload
// example (cleanliness / communication / respect_house_rules) — distinct
// from the incoming review categories (clean / accuracy / checkin /
// communication / location / value). Don't conflate.
export type GuestReviewCategory =
  | "cleanliness"
  | "communication"
  | "respect_house_rules";

export const GUEST_REVIEW_CATEGORIES: GuestReviewCategory[] = [
  "cleanliness",
  "communication",
  "respect_house_rules",
];

export type GuestReviewRating = 1 | 2 | 3 | 4 | 5;

export interface GuestReviewScore {
  category: GuestReviewCategory;
  rating: GuestReviewRating;
}

export interface SubmitGuestReviewPayload {
  scores: GuestReviewScore[];
  public_review: string;
  private_review?: string | null;
  is_reviewee_recommended: boolean;
  tags?: string[] | null;
}

export interface SubmitGuestReviewResult {
  success: boolean;
  channex_response: unknown;
}

export class ChannexValidationError extends Error {
  details: unknown;
  constructor(message: string, details: unknown) {
    super(message);
    this.name = "ChannexValidationError";
    this.details = details;
  }
}

export class ChannexNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannexNotFoundError";
  }
}

export class ChannexServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannexServerError";
  }
}

export class ChannexUnexpectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannexUnexpectedError";
  }
}

class ChannexClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
  }

  async request<T = AnyResponse>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = (options.method ?? "GET").toUpperCase();
    console.log(`[Channex] ${method} ${url}`);

    // Every non-GET call is an outbound mutation we want to reconstruct
    // later. Read calls don't log (they don't change state; logging them
    // would bloat the table). See docs/postmortems/INCIDENT_POSTMORTEM_BDC_CLOBBER.md.
    const shouldLog = method !== "GET";

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "user-api-key": this.apiKey,
          ...options.headers,
        },
      });
    } catch (err) {
      if (shouldLog) {
        await this.logOutbound(endpoint, method, options.body, null, null,
          err instanceof Error ? err.message : String(err));
      }
      throw err;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (shouldLog) {
        await this.logOutbound(endpoint, method, options.body, res.status, null,
          `${res.status} ${res.statusText} — ${body}`);
      }
      throw new Error(
        `Channex API error: ${res.status} ${res.statusText} — ${body}`
      );
    }

    const json = await res.json();
    if (shouldLog) {
      await this.logOutbound(endpoint, method, options.body, res.status, json, null);
    }
    return json;
  }

  /**
   * Insert a row into channex_outbound_log for every mutation. Fire-and-
   * await but catch-and-continue: logging failure (e.g. DB down) must not
   * block the Channex call from returning. Channex reliability > log
   * completeness.
   *
   * Extracts rate_plan_id / channex_property_id / date range from the body
   * when the payload follows Channex's common {values: [{...}]} shape.
   */
  private async logOutbound(
    endpoint: string,
    method: string,
    body: BodyInit | null | undefined,
    responseStatus: number | null,
    responseBody: unknown | null,
    errorMessage: string | null
  ): Promise<void> {
    try {
      const { createServiceClient } = await import("@/lib/supabase/service");
      const { createHash } = await import("node:crypto");
      const sb = createServiceClient();

      const bodyStr = typeof body === "string" ? body : body == null ? "" : "";
      const payloadHash = bodyStr ? createHash("sha256").update(bodyStr).digest("hex") : null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: any = null;
      if (bodyStr) {
        try { parsed = JSON.parse(bodyStr); } catch { /* non-JSON body */ }
      }

      let sample: unknown = null;
      let entriesCount: number | null = null;
      let dateFrom: string | null = null;
      let dateTo: string | null = null;
      let ratePlanId: string | null = null;
      let channexPropertyId: string | null = null;

      const valuesArr = Array.isArray(parsed?.values) ? parsed.values : null;
      if (valuesArr) {
        sample = valuesArr.slice(0, 3);
        entriesCount = valuesArr.length;
        const first = valuesArr[0] ?? {};
        const last = valuesArr[valuesArr.length - 1] ?? {};
        dateFrom = first.date_from ?? null;
        dateTo = last.date_to ?? null;
        ratePlanId = first.rate_plan_id ?? null;
        channexPropertyId = first.property_id ?? null;
      } else if (parsed) {
        sample = parsed;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("channex_outbound_log") as any).insert({
        property_id: null, // resolvable later via channex_property_id join
        channex_property_id: channexPropertyId,
        rate_plan_id: ratePlanId,
        endpoint,
        method,
        date_from: dateFrom,
        date_to: dateTo,
        entries_count: entriesCount,
        payload_hash: payloadHash,
        payload_sample: sample,
        response_status: responseStatus,
        response_body: responseBody,
        error_message: errorMessage,
      });
    } catch (err) {
      console.error(
        "[channex/log] Failed to record outbound call:",
        err instanceof Error ? err.message : err
      );
    }
  }

  // ==================== Properties ====================

  async getProperties(): Promise<ChannexProperty[]> {
    const allProperties: ChannexProperty[] = [];
    let page = 1;
    while (true) {
      const res = await this.request<ChannexResponse<ChannexProperty[]>>(
        `/properties?page=${page}&limit=100`
      );
      allProperties.push(...res.data);
      if (!res.meta || allProperties.length >= res.meta.total) break;
      page++;
    }
    return allProperties;
  }

  async getProperty(id: string): Promise<ChannexProperty> {
    const res = await this.request<ChannexResponse<ChannexProperty>>(
      `/properties/${id}`
    );
    return res.data;
  }

  async createProperty(data: {
    title: string;
    currency: string;
    email: string;
    phone: string;
    zip_code: string;
    country: string;
    state: string;
    city: string;
    address: string;
    longitude: number;
    latitude: number;
    timezone: string;
  }): Promise<ChannexProperty> {
    const res = await this.request<ChannexResponse<ChannexProperty>>(
      "/properties",
      {
        method: "POST",
        body: JSON.stringify({
          property: {
            ...data,
            content: { description: "StayCommand test property" },
          },
        }),
      }
    );
    return res.data;
  }

  /**
   * Delete a Channex property. Used to clean up orphaned scaffold
   * properties that were auto-created by the BDC connect flow when the
   * user later imports the real Channex property via OAuth.
   */
  async deleteProperty(propertyId: string): Promise<AnyResponse> {
    return this.request(`/properties/${propertyId}`, { method: "DELETE" });
  }

  // ==================== Room Types ====================

  async getRoomTypes(propertyId: string): Promise<ChannexRoomType[]> {
    const res = await this.request<ChannexResponse<ChannexRoomType[]>>(
      `/room_types?filter[property_id]=${propertyId}`
    );
    return res.data;
  }

  async createRoomType(data: {
    property_id: string;
    title: string;
    count_of_rooms: number;
    occ_adults: number;
    occ_children: number;
    occ_infants: number;
    default_occupancy: number;
  }): Promise<ChannexRoomType> {
    const res = await this.request<ChannexResponse<ChannexRoomType>>(
      "/room_types",
      {
        method: "POST",
        body: JSON.stringify({ room_type: data }),
      }
    );
    return res.data;
  }

  // ==================== Rate Plans ====================

  async getRatePlans(propertyId: string) {
    const res = await this.request<
      ChannexResponse<ChannexEntity<{ title: string; room_type_id: string }>[]>
    >(`/rate_plans?filter[property_id]=${propertyId}`);
    return res.data;
  }

  async createRatePlan(data: {
    property_id: string;
    room_type_id: string;
    title: string;
    currency: string;
    sell_mode: string;
    rate_mode: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options?: any[];
  }): Promise<ChannexEntity<{ title: string; room_type_id: string }>> {
    const res = await this.request<
      ChannexResponse<ChannexEntity<{ title: string; room_type_id: string }>>
    >("/rate_plans", {
      method: "POST",
      body: JSON.stringify({
        rate_plan: {
          ...data,
          // NOTE: Do NOT set a default rate here. The rate will come from the OTA
          // listing when the channel is mapped. Setting a rate here would override
          // the Airbnb/OTA price with the scaffold default.
          options: data.options ?? [
            { occupancy: 1, is_primary: true },
          ],
        },
      }),
    });
    return res.data;
  }

  // ==================== Bookings ====================

  async getBookings(params?: {
    propertyId?: string;
    arrivalFrom?: string;
    arrivalTo?: string;
    departureFrom?: string;
    departureTo?: string;
  }): Promise<ChannexBooking[]> {
    const sp = new URLSearchParams();
    if (params?.propertyId)
      sp.set("filter[property_id]", params.propertyId);
    if (params?.arrivalFrom)
      sp.set("filter[arrival_date][gte]", params.arrivalFrom);
    if (params?.arrivalTo)
      sp.set("filter[arrival_date][lte]", params.arrivalTo);
    if (params?.departureFrom)
      sp.set("filter[departure_date][gte]", params.departureFrom);
    if (params?.departureTo)
      sp.set("filter[departure_date][lte]", params.departureTo);
    const query = sp.toString();
    const res = await this.request<ChannexResponse<ChannexBooking[]>>(
      `/bookings${query ? `?${query}` : ""}`
    );
    return res.data;
  }

  async getBooking(id: string): Promise<ChannexBooking> {
    const res = await this.request<ChannexResponse<ChannexBooking>>(
      `/bookings/${id}`
    );
    return res.data;
  }

  async createBooking(data: {
    property_id: string;
    room_type_id: string;
    rate_plan_id: string;
    arrival_date: string;
    departure_date: string;
    guest_name: string;
    guest_email?: string;
    occupancy?: { adults: number; children: number; infants: number };
    days?: Record<string, string>; // pre-built per-night rates
    amount?: number; // fallback: total in cents, divided evenly
    currency?: string;
  }): Promise<AnyResponse> {
    // Use pre-built days map if provided, otherwise calculate from amount
    let days = data.days;
    if (!days) {
      days = {};
      const ci = new Date(data.arrival_date + "T00:00:00Z");
      const co = new Date(data.departure_date + "T00:00:00Z");
      const nights = Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000));
      const nightRate = data.amount ? (data.amount / 100 / nights).toFixed(2) : "160.00";
      for (let i = 0; i < nights; i++) {
        const d = new Date(ci.getTime() + i * 86400000);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        days[`${y}-${m}-${day}`] = nightRate;
      }
    }

    const res = await this.request("/bookings", {
      method: "POST",
      body: JSON.stringify({
        booking: {
          status: "new",
          ota_name: "Offline",
          ota_reservation_code: `SC-${Date.now()}`,
          currency: data.currency ?? "USD",
          arrival_date: data.arrival_date,
          departure_date: data.departure_date,
          property_id: data.property_id,
          rooms: [
            {
              room_type_id: data.room_type_id,
              rate_plan_id: data.rate_plan_id,
              days,
              occupancy: data.occupancy ?? { adults: 1, children: 0, infants: 0, ages: [] },
              guests: [
                {
                  name: data.guest_name.split(" ")[0],
                  surname: data.guest_name.split(" ").slice(1).join(" ") || "Guest",
                },
              ],
            },
          ],
          customer: {
            name: data.guest_name.split(" ")[0],
            surname: data.guest_name.split(" ").slice(1).join(" ") || "Guest",
            mail: data.guest_email ?? "test@staycommand.com",
          },
        },
      }),
    });
    console.log(`[Channex] Created booking: ${JSON.stringify(res.data?.id ?? res)}`);
    return res;
  }

  async modifyBooking(
    bookingId: string,
    originalData: {
      property_id: string;
      room_type_id: string;
      rate_plan_id: string;
      guest_name: string;
      guest_email?: string;
      arrival_date: string;
      departure_date: string;
      currency?: string;
      days?: Record<string, string>; // pre-built per-night rates
    }
  ): Promise<AnyResponse> {
    // Use pre-built days map or generate default
    let days = originalData.days;
    if (!days) {
      days = {};
      const ci = new Date(originalData.arrival_date + "T00:00:00Z");
      const co = new Date(originalData.departure_date + "T00:00:00Z");
      const nights = Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000));
      for (let i = 0; i < nights; i++) {
        const d = new Date(ci.getTime() + i * 86400000);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        days[`${y}-${m}-${day}`] = "160.00";
      }
    }

    const res = await this.request(`/bookings/${bookingId}`, {
      method: "PUT",
      body: JSON.stringify({
        booking: {
          status: "modified",
          ota_name: "Offline",
          ota_reservation_code: `SC-${Date.now()}`,
          currency: originalData.currency ?? "USD",
          arrival_date: originalData.arrival_date,
          departure_date: originalData.departure_date,
          property_id: originalData.property_id,
          rooms: [
            {
              room_type_id: originalData.room_type_id,
              rate_plan_id: originalData.rate_plan_id,
              days,
              occupancy: { adults: 1, children: 0, infants: 0, ages: [] },
              guests: [
                {
                  name: originalData.guest_name.split(" ")[0],
                  surname: originalData.guest_name.split(" ").slice(1).join(" ") || "Guest",
                },
              ],
            },
          ],
          customer: {
            name: originalData.guest_name.split(" ")[0],
            surname: originalData.guest_name.split(" ").slice(1).join(" ") || "Guest",
            mail: originalData.guest_email ?? "test@staycommand.com",
          },
        },
      }),
    });
    console.log(`[Channex] Modified booking ${bookingId}`);
    return res;
  }

  async cancelBooking(
    bookingId: string,
    originalData: {
      property_id: string;
      room_type_id: string;
      rate_plan_id: string;
      guest_name: string;
      arrival_date: string;
      departure_date: string;
      currency?: string;
    }
  ): Promise<AnyResponse> {
    // CRS cancel requires full body with status: "cancelled"
    const days: Record<string, string> = {};
    const ci = new Date(originalData.arrival_date);
    const co = new Date(originalData.departure_date);
    for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
      days[d.toISOString().split("T")[0]] = "100.00";
    }

    const res = await this.request(`/bookings/${bookingId}`, {
      method: "PUT",
      body: JSON.stringify({
        booking: {
          status: "cancelled",
          ota_name: "Offline",
          ota_reservation_code: `SC-${Date.now()}`,
          currency: originalData.currency ?? "USD",
          arrival_date: originalData.arrival_date,
          departure_date: originalData.departure_date,
          property_id: originalData.property_id,
          rooms: [
            {
              room_type_id: originalData.room_type_id,
              rate_plan_id: originalData.rate_plan_id,
              days,
              occupancy: { adults: 1, children: 0, infants: 0, ages: [] },
            },
          ],
          customer: {
            name: originalData.guest_name.split(" ")[0],
            surname: originalData.guest_name.split(" ").slice(1).join(" ") || "Guest",
          },
        },
      }),
    });
    console.log(`[Channex] Cancelled booking ${bookingId}`);
    return res;
  }

  // ==================== Webhooks ====================

  async createWebhook(data: {
    property_id: string;
    callback_url: string;
    event_mask: string;
    is_active?: boolean;
    send_data?: boolean;
  }): Promise<AnyResponse> {
    const res = await this.request("/webhooks", {
      method: "POST",
      body: JSON.stringify({
        webhook: {
          property_id: data.property_id,
          callback_url: data.callback_url,
          event_mask: data.event_mask,
          is_active: data.is_active ?? true,
          send_data: data.send_data ?? true,
          headers: {},
        },
      }),
    });
    console.log(`[Channex] Webhook created: ${JSON.stringify(res.data?.id ?? res)}`);
    return res;
  }

  async listWebhooks(): Promise<AnyResponse> {
    return this.request("/webhooks");
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.request(`/webhooks/${webhookId}`, { method: "DELETE" });
  }

  // ==================== Booking Revisions ====================

  async acknowledgeBookingRevision(revisionId: string): Promise<void> {
    await this.request(`/booking_revisions/${revisionId}/ack`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    console.log(`[Channex] Acknowledged booking revision ${revisionId}`);
  }

  async getUnacknowledgedRevisions(propertyId?: string) {
    const filter = propertyId ? `?filter[property_id]=${propertyId}` : "";
    return this.request(`/booking_revisions/feed${filter}`);
  }

  // ==================== Availability ====================

  async getAvailability(
    propertyId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<ChannexEntity<ChannexAvailabilityAttrs>[]> {
    const res = await this.request<
      ChannexResponse<ChannexEntity<ChannexAvailabilityAttrs>[]>
    >(
      `/availability?filter[property_id]=${propertyId}&filter[date][gte]=${dateFrom}&filter[date][lte]=${dateTo}`
    );
    return res.data;
  }

  async updateAvailability(
    values: {
      property_id: string;
      room_type_id: string;
      date_from: string;
      date_to: string;
      availability: number;
    }[]
  ): Promise<AnyResponse> {
    console.log(`[Channex] Updating availability: ${values.length} entries`);
    return this.request("/availability", {
      method: "POST",
      body: JSON.stringify({ values }),
    });
  }

  // ==================== Restrictions (Rates + Rules) ====================

  async getRestrictions(
    propertyId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<ChannexEntity<ChannexRestrictionAttrs>[]> {
    const res = await this.request<
      ChannexResponse<ChannexEntity<ChannexRestrictionAttrs>[]>
    >(
      `/restrictions?filter[property_id]=${propertyId}&filter[date][gte]=${dateFrom}&filter[date][lte]=${dateTo}`
    );
    return res.data;
  }

  /**
   * Fetch restrictions for a property in the "bucketed" format Channex uses
   * when you pass `filter[restrictions]=...`. The response is nested as
   *   { rate_plan_id: { "YYYY-MM-DD": { rate, availability, min_stay_arrival, stop_sell } } }
   * which is the shape we need for per-channel rate UI — one call returns
   * every rate plan on the property in a single round-trip.
   */
  async getRestrictionsBucketed(
    propertyId: string,
    dateFrom: string,
    dateTo: string,
    fields: Array<"rate" | "availability" | "min_stay_arrival" | "min_stay_through" | "stop_sell" | "closed_to_arrival" | "closed_to_departure"> = ["rate", "availability", "min_stay_arrival", "stop_sell"]
  ): Promise<Record<string, Record<string, {
    rate?: string;
    availability?: number;
    min_stay_arrival?: number;
    min_stay_through?: number;
    stop_sell?: boolean;
    closed_to_arrival?: boolean;
    closed_to_departure?: boolean;
  }>>> {
    const res = await this.request<{
      data: Record<string, Record<string, Record<string, unknown>>>;
    }>(
      `/restrictions?filter[property_id]=${propertyId}&filter[date][gte]=${dateFrom}&filter[date][lte]=${dateTo}&filter[restrictions]=${fields.join(",")}`
    );
    return (res.data ?? {}) as Record<string, Record<string, {
      rate?: string;
      availability?: number;
      min_stay_arrival?: number;
      min_stay_through?: number;
      stop_sell?: boolean;
      closed_to_arrival?: boolean;
      closed_to_departure?: boolean;
    }>>;
  }

  async updateRestrictions(
    values: {
      property_id: string;
      rate_plan_id: string;
      date_from: string;
      date_to: string;
      rate?: number;
      min_stay_arrival?: number;
      max_stay?: number;
      stop_sell?: boolean;
      closed_to_arrival?: boolean;
      closed_to_departure?: boolean;
    }[]
  ): Promise<AnyResponse> {
    console.log(`[Channex] Updating restrictions: ${values.length} entries`);
    return this.request("/restrictions", {
      method: "POST",
      body: JSON.stringify({ values }),
    });
  }

  // ==================== Reviews ====================

  /**
   * GET /api/v1/reviews?filter[property_id]=<uuid>&page[limit]=<n>
   * Returns the Channex review entities for a property. Paginates via
   * page[number] + page[limit]; default limit is 10. Session 6.
   */
  async getReviews(
    propertyId: string,
    options: { limit?: number; page?: number } = {}
  ): Promise<ChannexReview[]> {
    const limit = options.limit ?? 50;
    const page = options.page ?? 1;
    const url = `/reviews?filter[property_id]=${propertyId}&page[limit]=${limit}&page[number]=${page}`;
    const res = await this.request<{ data?: Array<{ id: string; attributes: ChannexReviewAttrs }> }>(url);
    // `attributes.id` and the envelope `id` are always identical for
    // Channex review entities; the flattened ChannexReview type is
    // just the attributes themselves.
    return (res.data ?? []).map((r) => r.attributes);
  }

  /**
   * POST /api/v1/reviews/:review_id/reply
   * Body: { reply: { reply: "<text>" } }
   */
  async respondToReview(reviewId: string, response: string): Promise<AnyResponse> {
    return this.request(`/reviews/${reviewId}/reply`, {
      method: "POST",
      body: JSON.stringify({ reply: { reply: response } }),
    });
  }

  /**
   * POST /api/v1/reviews/:review_id/guest_review — Airbnb only.
   *
   * Body shape (from doc + dry probe 2026-04-24):
   *   { review: { scores: [{category, rating}], public_review,
   *               private_review?, is_reviewee_recommended, tags? } }
   *
   * CRITICAL: Channex validates payload SHAPE only. A 200 response does
   * NOT mean Airbnb accepted the submission — Airbnb's downstream
   * validation will silently reject malformed categories or out-of-range
   * ratings. Always validate client-side against the canonical Airbnb
   * rules before calling this. See channex-expert known-quirks.md.
   */
  async submitGuestReview(
    reviewId: string,
    payload: SubmitGuestReviewPayload,
  ): Promise<SubmitGuestReviewResult> {
    const body = JSON.stringify({ review: payload });
    const url = `${this.baseUrl}/reviews/${reviewId}/guest_review`;
    console.log(`[Channex] POST ${url}`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "user-api-key": this.apiKey,
        "accept": "application/json",
        "content-type": "application/json",
      },
      body,
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep raw */ }

    if (res.status === 200) {
      return { success: true, channex_response: parsed };
    }
    if (res.status === 422) {
      throw new ChannexValidationError("Channex rejected guest_review payload", parsed);
    }
    if (res.status === 404) {
      throw new ChannexNotFoundError(`Channex review ${reviewId} not found`);
    }
    if (res.status >= 500) {
      throw new ChannexServerError(`Channex ${res.status}: ${text}`);
    }
    throw new ChannexUnexpectedError(`Channex returned ${res.status}: ${text}`);
  }

  // ==================== Certification Helpers ====================

  async fullSync(
    propertyId: string,
    roomTypeIds: string[],
    ratePlanIds: { ratePlanId: string; roomTypeId: string }[],
    days: number = 500
  ): Promise<{ availabilityResult: AnyResponse; restrictionsResult: AnyResponse }> {
    const startDate = new Date();
    const dateStr = (d: Date) => d.toISOString().split("T")[0];

    // Build availability values — all room types, 500 days
    // Use date ranges to minimize entries
    const availValues = roomTypeIds.map((rtId) => ({
      property_id: propertyId,
      room_type_id: rtId,
      date_from: dateStr(startDate),
      date_to: dateStr(new Date(startDate.getTime() + (days - 1) * 86400000)),
      availability: 10,
    }));

    // Build restriction values — all rate plans, 500 days with varied rates
    const restrictValues: {
      property_id: string;
      rate_plan_id: string;
      date_from: string;
      date_to: string;
      rate: number;
      min_stay_arrival: number;
      stop_sell: boolean;
      closed_to_arrival: boolean;
      closed_to_departure: boolean;
    }[] = [];

    for (const rp of ratePlanIds) {
      // Generate monthly rate blocks with seasonal variation
      const current = new Date(startDate);
      while (current.getTime() < startDate.getTime() + days * 86400000) {
        const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
        const blockEnd = new Date(Math.min(
          monthEnd.getTime(),
          startDate.getTime() + (days - 1) * 86400000
        ));

        const month = current.getMonth();
        // Seasonal rate variation (cents): summer higher, winter lower
        const seasonal = [9500, 9000, 9500, 10000, 11000, 12500, 13000, 13000, 12000, 10500, 9500, 9000];
        const baseRate = seasonal[month];

        restrictValues.push({
          property_id: propertyId,
          rate_plan_id: rp.ratePlanId,
          date_from: dateStr(current),
          date_to: dateStr(blockEnd),
          rate: baseRate,
          min_stay_arrival: 1,
          stop_sell: false,
          closed_to_arrival: false,
          closed_to_departure: false,
        });

        current.setTime(blockEnd.getTime() + 86400000);
      }
    }

    // Exactly 2 API calls
    console.log(`[Channex] Full sync: ${availValues.length} avail entries, ${restrictValues.length} restriction entries`);
    const [availabilityResult, restrictionsResult] = await Promise.all([
      this.updateAvailability(availValues),
      this.updateRestrictions(restrictValues),
    ]);

    return { availabilityResult, restrictionsResult };
  }

  // ==================== Channels ====================

  async getChannels(propertyId: string): Promise<AnyResponse> {
    return this.request(`/channels?filter[property_id]=${propertyId}`);
  }

  async getAllChannels(): Promise<AnyResponse> {
    return this.request("/channels");
  }

  async createChannel(data: {
    channel: string;
    title: string;
    properties: string[];
    settings?: Record<string, unknown>;
    group_id?: string;
  }): Promise<AnyResponse> {
    const res = await this.request("/channels", {
      method: "POST",
      body: JSON.stringify({ channel: data }),
    });
    console.log(`[Channex] Created channel: ${res.data?.id}`);
    return res;
  }

  /**
   * Activate a BDC channel via Channex's dedicated activation endpoint.
   * `PUT /channels/{id} { is_active: true }` silently no-ops for newly
   * created BookingCom channels — we discovered this the hard way during
   * Villa Jamaica setup. The correct endpoint is POST /channels/{id}/activate
   * which Channex documents separately.
   */
  async activateChannel(channelId: string): Promise<AnyResponse> {
    return this.request(`/channels/${channelId}/activate`, { method: "POST" });
  }

  /**
   * Delete a Channex channel. Used on property deletion and compensating
   * rollback in the BDC connect flow.
   */
  async deleteChannel(channelId: string): Promise<AnyResponse> {
    return this.request(`/channels/${channelId}`, { method: "DELETE" });
  }

  /**
   * Delete a Channex rate plan. Used in compensating rollback.
   */
  async deleteRatePlan(ratePlanId: string): Promise<AnyResponse> {
    return this.request(`/rate_plans/${ratePlanId}`, { method: "DELETE" });
  }

  async updateChannel(channelId: string, data: {
    properties?: string[];
    settings?: Record<string, unknown>;
    is_active?: boolean;
    title?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rate_plans?: any[];
  }): Promise<AnyResponse> {
    const res = await this.request(`/channels/${channelId}`, {
      method: "PUT",
      body: JSON.stringify({ channel: data }),
    });
    return res;
  }

  async testChannelConnection(channelId: string): Promise<{ status: string; message?: string; raw?: unknown }> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await this.request<any>(`/channels/${channelId}`);
      console.log(`[Channex] Channel ${channelId} state:`, JSON.stringify(res.data?.attributes ?? res.data ?? res).slice(0, 500));
      const attrs = res.data?.attributes ?? {};
      const isActive = attrs.is_active === true;
      const state = attrs.state ?? attrs.status ?? "unknown";
      return {
        status: isActive ? "ok" : state,
        message: isActive ? "Channel is active" : `Channel state: ${state}`,
        raw: attrs,
      };
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  // ==================== One-Time Token ====================

  async createOneTimeToken(propertyId: string, groupId?: string): Promise<{ token: string }> {
    const body: Record<string, string> = { property_id: propertyId };
    if (groupId) body.group_id = groupId;
    // Response is { data: { token: "..." }, meta: { message: "..." } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await this.request<any>(
      "/auth/one_time_token",
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
    const token = res.data?.token ?? res.data?.attributes?.token;
    if (!token) throw new Error("No token in Channex response");
    return { token };
  }

  // ==================== Health Check ====================

  async testConnection(): Promise<boolean> {
    try {
      await this.request<ChannexResponse<ChannexProperty[]>>(
        "/properties?limit=1"
      );
      return true;
    } catch {
      return false;
    }
  }
}

export function createChannexClient(): ChannexClient {
  const apiKey = process.env.CHANNEX_API_KEY;
  if (!apiKey) throw new Error("CHANNEX_API_KEY is not set");
  const baseUrl =
    process.env.CHANNEX_API_URL ?? DEFAULT_BASE_URL;
  return new ChannexClient(apiKey, baseUrl);
}
