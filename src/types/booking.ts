export type BookingStatus =
  | "confirmed"
  | "pending"
  | "cancelled"
  | "checked_in"
  | "checked_out";

export type BookingSource =
  | "airbnb"
  | "booking.com"
  | "vrbo"
  | "direct"
  | "other";

export interface Booking {
  id: string;
  propertyId: string;
  propertyName: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  status: BookingStatus;
  source: BookingSource;
  totalAmount: number;
  currency: string;
  notes: string | null;
  createdAt: string;
}
