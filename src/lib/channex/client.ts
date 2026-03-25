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

class ChannexClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
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

  // -- Properties --

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

  // -- Room Types --

  async getRoomTypes(propertyId: string): Promise<ChannexRoomType[]> {
    const res = await this.request<ChannexResponse<ChannexRoomType[]>>(
      `/room_types?filter[property_id]=${propertyId}`
    );
    return res.data;
  }

  // -- Rate Plans --

  async getRatePlans(propertyId: string) {
    const res = await this.request<
      ChannexResponse<ChannexEntity<{ title: string; room_type_id: string }>[]>
    >(`/rate_plans?filter[property_id]=${propertyId}`);
    return res.data;
  }

  // -- Bookings --

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

  // -- Availability --

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
  ): Promise<void> {
    await this.request("/availability", {
      method: "POST",
      body: JSON.stringify({ values }),
    });
  }

  // -- Restrictions (Rates) --

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
      rate: number;
      min_stay_arrival?: number;
      stop_sell?: boolean;
    }[]
  ): Promise<void> {
    await this.request("/restrictions", {
      method: "POST",
      body: JSON.stringify({ values }),
    });
  }

  // -- Health check --

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
