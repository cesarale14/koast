import type {
  ChannexResponse,
  ChannexProperty,
  ChannexRoomType,
  ChannexBooking,
  ChannexEntity,
  ChannexAvailabilityAttrs,
  ChannexRestrictionAttrs,
} from "./types";

const DEFAULT_BASE_URL = "https://app.channex.io/api/v1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResponse = any;

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
    console.log(`[Channex] ${options.method ?? "GET"} ${url}`);

    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "user-api-key": this.apiKey,
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Channex API error: ${res.status} ${res.statusText} — ${body}`
      );
    }

    return res.json();
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

  async updateChannel(channelId: string, data: {
    properties?: string[];
    settings?: Record<string, unknown>;
    is_active?: boolean;
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
