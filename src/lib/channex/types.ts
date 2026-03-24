export interface ChannexProperty {
  id: string;
  title: string;
  currency: string;
  country: string;
  city: string;
  address: string;
  zip_code: string;
  longitude: number;
  latitude: number;
  content: {
    description: string;
    photos: { url: string; description: string }[];
  };
}

export interface ChannexRoomType {
  id: string;
  property_id: string;
  title: string;
  count_of_rooms: number;
  occ_adults: number;
  occ_children: number;
  occ_infants: number;
  default_occupancy: number;
}

export interface ChannexBooking {
  id: string;
  property_id: string;
  room_type_id: string;
  status: "new" | "modified" | "cancelled";
  guest_name: string;
  arrival_date: string;
  departure_date: string;
  amount: number;
  currency: string;
  source: string;
  inserted_at: string;
  updated_at: string;
}

export interface ChannexAvailability {
  property_id: string;
  room_type_id: string;
  date: string;
  availability: number;
  rate: number;
  min_stay: number;
}
