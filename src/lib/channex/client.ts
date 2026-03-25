import type {
  ChannexResponse,
  ChannexProperty,
  ChannexRoomType,
  ChannexBooking,
  ChannexEntity,
  ChannexAvailabilityAttrs,
  ChannexRestrictionAttrs,
} from "./types";

const DEFAULT_BASE_URL = "https://staging.channex.io/api/v1";

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
    console.log(`[Channex] ${options.method ?? "GET"} ${endpoint}`);

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
          options: data.options ?? [
            { occupancy: data.sell_mode === "per_room" ? 1 : 1, is_primary: true, rate: 10000 },
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
    amount?: number; // in cents
    currency?: string;
  }): Promise<AnyResponse> {
    const res = await this.request("/bookings", {
      method: "POST",
      body: JSON.stringify({
        booking: {
          status: "new",
          ota_name: "BookingCRS",
          currency: data.currency ?? "USD",
          arrival_date: data.arrival_date,
          departure_date: data.departure_date,
          property_id: data.property_id,
          rooms: [
            {
              room_type_id: data.room_type_id,
              rate_plan_id: data.rate_plan_id,
              occupancy: data.occupancy ?? { adults: 1, children: 0, infants: 0 },
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

  async modifyBooking(bookingId: string, updates: {
    departure_date?: string;
    arrival_date?: string;
  }): Promise<AnyResponse> {
    const res = await this.request(`/bookings/${bookingId}`, {
      method: "PUT",
      body: JSON.stringify({
        booking: {
          ...updates,
        },
      }),
    });
    console.log(`[Channex] Modified booking ${bookingId}`);
    return res;
  }

  async cancelBooking(bookingId: string): Promise<AnyResponse> {
    const res = await this.request(`/bookings/${bookingId}`, {
      method: "PUT",
      body: JSON.stringify({
        booking: {
          status: "cancelled",
        },
      }),
    });
    console.log(`[Channex] Cancelled booking ${bookingId}`);
    return res;
  }

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
