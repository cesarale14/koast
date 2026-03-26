export interface ICalBooking {
  uid: string;
  guestName: string | null;
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  platform: string;
  isBlocked: boolean;
  description: string | null;
}
