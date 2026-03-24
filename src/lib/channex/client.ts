import type {
  ChannexProperty,
  ChannexRoomType,
  ChannexBooking,
} from "./types";

const CHANNEX_BASE_URL = "https://app.channex.io/api/v1";

class ChannexClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const res = await fetch(`${CHANNEX_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "user-api-key": this.apiKey,
        ...options.headers,
      },
    });

    if (!res.ok) {
      throw new Error(`Channex API error: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async getProperties(): Promise<ChannexProperty[]> {
    const data = await this.request<{ data: ChannexProperty[] }>("/properties");
    return data.data;
  }

  async getProperty(id: string): Promise<ChannexProperty> {
    const data = await this.request<{ data: ChannexProperty }>(
      `/properties/${id}`
    );
    return data.data;
  }

  async getRoomTypes(propertyId: string): Promise<ChannexRoomType[]> {
    const data = await this.request<{ data: ChannexRoomType[] }>(
      `/room_types?filter[property_id]=${propertyId}`
    );
    return data.data;
  }

  async getBookings(params?: {
    property_id?: string;
    from?: string;
    to?: string;
  }): Promise<ChannexBooking[]> {
    const searchParams = new URLSearchParams();
    if (params?.property_id)
      searchParams.set("filter[property_id]", params.property_id);
    if (params?.from) searchParams.set("filter[date_from]", params.from);
    if (params?.to) searchParams.set("filter[date_to]", params.to);

    const query = searchParams.toString();
    const data = await this.request<{ data: ChannexBooking[] }>(
      `/bookings${query ? `?${query}` : ""}`
    );
    return data.data;
  }

  async updateAvailability(
    propertyId: string,
    roomTypeId: string,
    updates: { date: string; availability: number }[]
  ): Promise<void> {
    await this.request(`/availability`, {
      method: "PUT",
      body: JSON.stringify({
        values: updates.map((u) => ({
          property_id: propertyId,
          room_type_id: roomTypeId,
          date: u.date,
          availability: u.availability,
        })),
      }),
    });
  }

  async updateRates(
    propertyId: string,
    ratePlanId: string,
    updates: { date: string; rate: number }[]
  ): Promise<void> {
    await this.request(`/rate_plans/${ratePlanId}/rates`, {
      method: "PUT",
      body: JSON.stringify({
        values: updates.map((u) => ({
          property_id: propertyId,
          date: u.date,
          rate: u.rate,
        })),
      }),
    });
  }
}

export function createChannexClient(): ChannexClient {
  const apiKey = process.env.CHANNEX_API_KEY;
  if (!apiKey) throw new Error("CHANNEX_API_KEY is not set");
  return new ChannexClient(apiKey);
}
