// Channex JSON:API response types

export interface ChannexResponse<T> {
  data: T;
  meta?: { page: number; limit: number; total: number };
}

export interface ChannexEntity<T> {
  type: string;
  id: string;
  attributes: T;
  relationships?: Record<string, { data: { type: string; id: string } | { type: string; id: string }[] }>;
}

// Property attributes
export interface ChannexPropertyAttrs {
  title: string;
  currency: string;
  country: string;
  city: string;
  state: string;
  address: string;
  zip_code: string;
  longitude: number | null;
  latitude: number | null;
  content?: {
    description?: string;
    photos?: { url: string; description?: string }[];
  };
  is_active: boolean;
}

// Room type attributes
export interface ChannexRoomTypeAttrs {
  title: string;
  count_of_rooms: number;
  occ_adults: number;
  occ_children: number;
  occ_infants: number;
  default_occupancy: number;
}

// Booking attributes
export interface ChannexBookingAttrs {
  status: "new" | "modified" | "cancelled";
  arrival_date: string;
  departure_date: string;
  amount: string;
  currency: string;
  ota_name: string;
  ota_reservation_code: string;
  customer?: {
    name?: string;
    surname?: string;
    mail?: string;
    phone?: string;
  };
  rooms?: {
    room_type_id: string;
    occupancy?: { adults: number; children: number; infants: number };
    amount: string;
    days?: Record<string, number>;
  }[];
  notes?: string;
  inserted_at: string;
  updated_at: string;
}

// Availability entry
export interface ChannexAvailabilityAttrs {
  date: string;
  availability: number;
  property_id: string;
  room_type_id: string;
}

// Restriction (rate) entry
export interface ChannexRestrictionAttrs {
  date: string;
  rate: number;
  min_stay_arrival: number;
  closed_to_arrival: boolean;
  stop_sell: boolean;
  property_id: string;
  rate_plan_id: string;
  room_type_id: string;
}

// Webhook event payload
export interface ChannexWebhookPayload {
  event: string;
  payload: {
    booking_id?: string;
    property_id?: string;
    revision_id?: string;
  };
  property_id: string;
  timestamp: string;
}

export type ChannexProperty = ChannexEntity<ChannexPropertyAttrs>;
export type ChannexRoomType = ChannexEntity<ChannexRoomTypeAttrs>;
export type ChannexBooking = ChannexEntity<ChannexBookingAttrs>;
